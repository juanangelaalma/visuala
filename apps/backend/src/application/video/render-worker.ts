import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderJobInputSnapshotSchema } from "../../domain/video/render-input";
import { buildRenderManifest } from "../../domain/video/render-manifest";
import { storyboardSchema } from "../../domain/video/storyboard";
import { videoBriefSchema } from "../../domain/video/brief";
import { RENDER_FAILURE_CODES, RenderError, VideoError } from "../../domain/video/errors";
import { beginRenderJob } from "./render-jobs";
import type { RenderEngine, RenderEngineResult } from "../../domain/video/render-engine";
import type { RenderJobInputSnapshot } from "../../domain/video/render-input";
import type { RenderManifest } from "../../domain/video/render-manifest";
import type { RenderFailureCode } from "../../domain/video/errors";
import type { RenderWorkerConfig } from "../../domain/video/render-config";
import type { AssetObjectStore } from "../../domain/ai-service/assets";
import type {
  ProjectAssetRepository, VideoBriefRevisionRepository, VideoProjectRepository, VideoRenderJobRepository,
  VideoStoryboardRevisionRepository, VideoVersionRepository,
} from "../../domain/video/contracts";

/** A directory the worker owns for one attempt, and the only way it cleans up. */
export type RenderWorkspaceHandle = { dir: string; dispose: () => Promise<void> };

export type RenderWorkerDependencies = {
  createId: () => string;
  now: () => string;
  fps: number;
  config: RenderWorkerConfig;
  /**
   * Aborted when the process is shutting down, so an in-flight render is interrupted through the
   * engine's own cancellation path instead of being SIGKILLed mid-encode with Chrome and FFmpeg still
   * running. Optional: a test, and a future cloud worker, may have no such signal.
   */
  shutdownSignal?: AbortSignal;
  /**
   * Injected, not imported: the application layer may not reach into infrastructure, so the factory
   * in `services.ts` hands over the concrete temporary-directory implementation.
   */
  createWorkspace: (jobId: string) => Promise<RenderWorkspaceHandle>;
  projects: Pick<VideoProjectRepository, "transition" | "consumeRerender" | "getOwned">;
  assets: Pick<ProjectAssetRepository, "listOwned">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "getOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "getOwned">;
  versions: Pick<VideoVersionRepository, "create" | "latestOwned">;
  jobs: Pick<VideoRenderJobRepository, "getById" | "begin" | "fail" | "markRendering" | "markUploading" | "succeed" | "listQueued" | "listStale">;
  objectStore: Pick<AssetObjectStore, "read" | "write">;
  engine: RenderEngine;
};

export type RenderJobOutcome = { jobId: string; status: "succeeded" | "failed" | "skipped"; code?: RenderFailureCode };

/**
 * One job, end to end. The claim is `beginRenderJob`, which is the same call the routes' intake shares,
 * so the rerender quota is consumed exactly once, by whichever worker wins the conditional update.
 *
 * The order of the writes at the end is deliberate: the object is uploaded before the version row, and
 * the row before the job is marked succeeded. A crash between any two of them leaves a retryable state
 * (an orphan object, or a version whose job reads as failed), never a project that cannot be rendered.
 */
export async function runRenderJob(jobId: string, dependencies: RenderWorkerDependencies): Promise<RenderJobOutcome> {
  let claimed: { projectId: string; userId: string } | null = null;

  try {
    const started = await beginRenderJob({ jobId }, dependencies);

    // `preparing` is set by one thing only: the conditional `queued -> preparing` claim. Any other
    // status means another worker, or the reclaimer, holds this job, and a worker that lost the claim
    // must write nothing at all, not even a failure, on behalf of a job it does not own.
    if (started.status !== "preparing") return skipped(jobId);

    claimed = { projectId: started.projectId, userId: started.userId };

    const snapshot = parseSnapshot(started.inputSnapshot);
    const manifest = await loadManifest(started.id, snapshot, started.projectId, started.userId, dependencies);

    if (await dependencies.jobs.markRendering(jobId) === null) return skipped(jobId);

    // The version id is minted before the upload, because the object key names it and the key has to
    // exist before the row that points at it.
    const versionId = dependencies.createId();
    const workspace = await dependencies.createWorkspace(jobId);
    try {
      const rendered = await renderWithinBudget(jobId, manifest, workspace.dir, dependencies);

      if (await dependencies.jobs.markUploading(jobId) === null) return skipped(jobId);

      const objectKey = versionObjectKey(started.projectId, versionId);
      const bytes = await readOutput(rendered.outputPath);
      await upload(objectKey, bytes, dependencies);

      const parent = await dependencies.versions.latestOwned(started.projectId, started.userId);
      await dependencies.versions.create({
        id: versionId,
        projectId: started.projectId,
        userId: started.userId,
        versionNumber: (parent?.versionNumber ?? 0) + 1,
        renderJobId: jobId,
        ...(started.parentVersionId ? { parentVersionId: started.parentVersionId } : {}),
        outputObjectKey: objectKey,
        durationSeconds: Math.round(rendered.probe.durationSeconds),
        aspectRatio: snapshot.settings.aspectRatio,
        resolution: snapshot.settings.resolution,
        manifestHash: rendered.manifestHash,
      });

      await dependencies.jobs.succeed(jobId);
      await dependencies.projects.transition(started.projectId, started.userId, "rendering", "ready");
      return { jobId, status: "succeeded" };
    } finally {
      await workspace.dispose();
    }
  } catch (error) {
    const code = failureCode(error);
    // A job the reclaimer already failed must not be failed twice, and its project is already released.
    if (claimed && !(error instanceof VideoError && error.code === "video_render_job_not_found")) {
      await dependencies.jobs.fail(jobId, code).catch(() => null);
      await dependencies.projects.transition(claimed.projectId, claimed.userId, "rendering", "approved").catch(() => null);
    }
    return { jobId, status: "failed", code };
  }
}

/** Fails a job whose worker died and releases its project, so the user can render again. */
export async function reclaimStaleRenderJobs(dependencies: RenderWorkerDependencies): Promise<number> {
  const cutoff = new Date(Date.parse(dependencies.now()) - dependencies.config.staleJobMs).toISOString();
  const stale = await dependencies.jobs.listStale(cutoff, 50);

  let reclaimed = 0;
  for (const job of stale) {
    if (await dependencies.jobs.fail(job.id, "render_stale") === null) continue;
    await dependencies.projects.transition(job.projectId, job.userId, "rendering", "approved").catch(() => null);
    reclaimed += 1;
  }
  return reclaimed;
}

/** Oldest first, so a queue that backs up drains in the order users asked for renders. */
export async function claimNextRenderJob(dependencies: RenderWorkerDependencies): Promise<string | null> {
  const [next] = await dependencies.jobs.listQueued(1);
  return next?.id ?? null;
}

/**
 * Whether the loop should reclaim again. Reclaiming on a timer rather than on every idle poll keeps a
 * long-running replica able to rescue a peer's abandoned job without querying on every cycle.
 */
export function isReclaimDue(now: number, lastReclaimAt: number, intervalMs: number): boolean {
  return now - lastReclaimAt >= intervalMs;
}

function skipped(jobId: string): RenderJobOutcome {
  return { jobId, status: "skipped" };
}

/**
 * The strict snapshot schema is the only thing that catches a snapshot written by an older or a newer
 * deploy. A parse failure is a job that cannot be rendered, not a crash.
 */
function parseSnapshot(inputSnapshot: unknown): RenderJobInputSnapshot {
  const parsed = renderJobInputSnapshotSchema.safeParse(inputSnapshot);
  if (!parsed.success) {
    throw new RenderError("render_input_unsupported", "This render was queued by a version that no longer matches.");
  }
  return parsed.data;
}

/**
 * Reads the storyboard and brief the snapshot names, never "latest": the same rule the intake follows,
 * so a revision written after approval cannot change what this render is built from.
 */
async function loadManifest(
  jobId: string,
  snapshot: RenderJobInputSnapshot,
  projectId: string,
  userId: string,
  dependencies: RenderWorkerDependencies,
): Promise<RenderManifest> {
  const [storyboard, brief, assets, project] = await Promise.all([
    dependencies.storyboardRevisions.getOwned(snapshot.storyboardRevisionId, userId),
    dependencies.briefRevisions.getOwned(snapshot.briefRevisionId, userId),
    dependencies.assets.listOwned(projectId, userId),
    dependencies.projects.getOwned(projectId, userId),
  ]);

  if (!storyboard) throw new RenderError("render_input_unsupported", "The approved storyboard is no longer available.");
  if (!brief) throw new RenderError("render_input_unsupported", "The approved brief is no longer available.");
  if (!project) throw new RenderError("render_input_unsupported", "The project is no longer available.");

  const parsedStoryboard = storyboardSchema.safeParse({ scenes: storyboard.scenes });
  const parsedBrief = videoBriefSchema.safeParse(brief.brief);
  if (!parsedStoryboard.success || !parsedBrief.success) {
    throw new RenderError("render_input_unsupported", "The approved plan is no longer readable.");
  }

  return buildRenderManifest({
    projectId,
    renderJobId: jobId,
    snapshot,
    videoType: project.videoType,
    fps: snapshot.fps,
    scenes: parsedStoryboard.data.scenes,
    brief: {
      productName: parsedBrief.data.productName,
      brandName: parsedBrief.data.brandName,
      keyMessage: parsedBrief.data.keyMessage,
      callToAction: parsedBrief.data.callToAction,
      orderDestination: parsedBrief.data.orderDestination,
      menuItems: parsedBrief.data.menuItems,
    },
    assets: assets
      .filter((asset) => !asset.deletedAt && asset.moderationStatus !== "blocked")
      .map((asset) => ({ id: asset.id, objectKey: asset.objectKey, sha256: asset.sha256, mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width, height: asset.height })),
  });
}

/**
 * The PRD's ten-minute processing budget, and the worker's own shutdown, both enforced with an abort
 * rather than a kill: HyperFrames unwinds through its own cancellation path and leaves no Chrome or
 * FFmpeg behind.
 */
async function renderWithinBudget(
  jobId: string,
  manifest: RenderManifest,
  workDir: string,
  dependencies: RenderWorkerDependencies,
): Promise<RenderEngineResult> {
  const controller = new AbortController();
  let timedOut = false;
  let stopping = false;

  const shutdown = dependencies.shutdownSignal;
  const onShutdown = () => {
    stopping = true;
    controller.abort();
  };
  shutdown?.addEventListener("abort", onShutdown, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, dependencies.config.jobTimeoutMs);

  try {
    return await dependencies.engine.render({
      manifest,
      workDir,
      outputPath: join(workDir, "render.mp4"),
      signal: controller.signal,
      onProgress: (percent) => console.log(`Render job ${jobId}: ${Math.round(percent)}%`),
    });
  } catch (error) {
    // A shutdown is reported as a shutdown even when the budget also elapsed: the operator restarted
    // the worker, and the two failures have different user-facing copies.
    if (stopping) throw new RenderError("render_worker_shutdown", "The render worker stopped before this render finished.");
    if (timedOut) throw new RenderError("render_timeout", "The render took longer than this project allows.");
    throw error;
  } finally {
    clearTimeout(timer);
    shutdown?.removeEventListener("abort", onShutdown);
  }
}

/** A closed mapping, so no exception text can reach `error_code`. */
function failureCode(error: unknown): RenderFailureCode {
  if (error instanceof RenderError && (RENDER_FAILURE_CODES as readonly string[]).includes(error.code)) return error.code;
  return "render_engine_failed";
}

async function readOutput(outputPath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(outputPath));
}

/** A storage failure is its own code, because it is the one failure the user can simply retry. */
async function upload(objectKey: string, bytes: Uint8Array, dependencies: RenderWorkerDependencies): Promise<void> {
  try {
    await dependencies.objectStore.write(objectKey, bytes, "video/mp4");
  } catch {
    throw new RenderError("render_upload_failed", "The rendered video could not be stored.");
  }
}

/** The one place the version object key is built, so the upload and the row can never disagree. */
function versionObjectKey(projectId: string, versionId: string): string {
  return `video-versions/${projectId}/${versionId}.mp4`;
}
