import { join } from "node:path";
import { VideoError } from "../../domain/video/errors";
import { CompositionError, RenderFailure } from "../../domain/video-engine/errors";
import { ArtifactManifestError } from "../../domain/video-engine/artifact-manifest";
import { renderInputSnapshotSchema } from "../../domain/video-engine/render-input";
import {
  isActiveRenderJobStatus,
  type CompositionArtifactRepository,
  type CompositionEventRepository,
  type OutputKind,
  type RenderJob,
  type RenderJobRepository,
  type VideoVersionRepository,
} from "../../domain/video-engine/contracts";
import type { RenderCompositionEngine } from "../../domain/video-engine/render-engine";
import type { CompositionArtifactStore, RemoteArtifactFile } from "../../infrastructure/video-engine/composition-artifact-store";
import { processTrace } from "./process-trace";

export type RenderJobDependencies = {
  jobs: RenderJobRepository;
  versions: VideoVersionRepository;
  artifacts: CompositionArtifactRepository;
  events: CompositionEventRepository;
  artifactStore: CompositionArtifactStore;
  /** Materialises the downloaded artifact into the directory the renderer reads. */
  materialize: (files: readonly RemoteArtifactFile[], targetDir: string) => Promise<void>;
  engine: RenderCompositionEngine;
  upload: (objectKey: string, bytes: Uint8Array, mimeType: "video/mp4") => Promise<void>;
  readOutput: (path: string) => Promise<Uint8Array>;
  createScratchDir: () => Promise<string>;
  removeScratchDir: (dir: string) => Promise<void>;
  outputKey: (projectId: string, versionId: string) => string;
  createId: () => string;
  /** Draft for a preview, delivery quality for an export; the caller decides which is which. */
  qualityFor: (kind: OutputKind) => "draft" | "standard" | "high";
  maxArtifactFileBytes: number;
};

export type RenderJobOutcome =
  | { outcome: "not_found" }
  | { outcome: "not_queued"; status: RenderJob["status"] }
  | { outcome: "succeeded"; versionId: string; outputObjectKey: string }
  | { outcome: "failed"; errorCode: string };

/**
 * Runs one claimed job. A preview and an export take this same path and differ only in output kind and
 * quality. The artifact is read back from storage and hash-checked, so a render cannot use bytes that
 * drifted from what was approved.
 */
export async function runRenderJob(jobId: string, dependencies: RenderJobDependencies): Promise<RenderJobOutcome> {
  const jobTrace = processTrace({ jobId, sourceFile: "apps/backend/src/application/video-engine/render-job.ts" });
  const found = await jobTrace.run("render.job.read", () => dependencies.jobs.getById(jobId));
  if (!found) return { outcome: "not_found" };
  if (!isActiveRenderJobStatus(found.status)) return { outcome: "not_queued", status: found.status };

  const trace = processTrace({ jobId, projectId: found.projectId, sourceFile: "apps/backend/src/application/video-engine/render-job.ts" });
  const job = await trace.run("render.job.claim", () => dependencies.jobs.begin(jobId));
  if (!job) {
    const current = await trace.run("render.job.read", () => dependencies.jobs.getById(jobId));
    return { outcome: "not_queued", status: current?.status ?? found.status };
  }

  const startedAt = Date.now();
  try {
    return await trace.run<RenderJobOutcome>("render.job", async () => {
      const result = await render(job, dependencies);
      await trace.run("render.event.succeeded.persist", () => dependencies.events.record({
        projectId: job.projectId,
        userId: job.userId,
        event: "render_succeeded",
        renderJobId: job.id,
        renderStatus: "succeeded",
        renderDurationMs: Date.now() - startedAt,
      }));
      return { outcome: "succeeded", versionId: result.versionId, outputObjectKey: result.outputObjectKey };
    });
  } catch (error) {
    const errorCode = failureCode(error);
    await trace.run("render.job.failed.persist", () => dependencies.jobs.fail(jobId, errorCode));
    await trace.run("render.event.failed.persist", () => dependencies.events.record({
      projectId: job.projectId,
      userId: job.userId,
      event: "render_failed",
      renderJobId: job.id,
      renderStatus: "failed",
      renderDurationMs: Date.now() - startedAt,
      renderErrorCode: errorCode,
    }));
    return { outcome: "failed", errorCode };
  }
}

/** A job whose worker died is failed here rather than retried, so the project moves on and can be rendered again. */
export async function reclaimStaleJob(jobId: string, dependencies: Pick<RenderJobDependencies, "jobs" | "events">): Promise<RenderJobOutcome> {
  const job = await dependencies.jobs.getById(jobId);
  if (!job) return { outcome: "not_found" };
  if (!isActiveRenderJobStatus(job.status)) return { outcome: "not_queued", status: job.status };

  const failed = await dependencies.jobs.fail(jobId, "render_stale");
  if (!failed) return { outcome: "not_queued", status: job.status };

  await dependencies.events.record({
    projectId: job.projectId,
    userId: job.userId,
    event: "render_failed",
    renderJobId: job.id,
    renderStatus: "failed",
    renderErrorCode: "render_stale",
  });
  return { outcome: "failed", errorCode: "render_stale" };
}

async function render(job: RenderJob, dependencies: RenderJobDependencies): Promise<{ versionId: string; outputObjectKey: string }> {
  const trace = processTrace({ jobId: job.id, projectId: job.projectId, sourceFile: "apps/backend/src/application/video-engine/render-job.ts" });
  const snapshot = renderInputSnapshotSchema.parse(job.inputSnapshot);

  const artifact = await trace.run("render.artifact.read", () => dependencies.artifacts.getById(job.compositionArtifactId));
  if (!artifact) throw new VideoError("video_render_job_not_found", "The composition this job renders is gone.");

  const files = await trace.run("render.artifact.download", () => dependencies.artifactStore.read(artifact.artifactPrefix, {
    compositionHash: artifact.compositionHash,
    maxBytesPerFile: dependencies.maxArtifactFileBytes,
  }));

  const scratchDir = await trace.run("render.scratch.allocate", () => dependencies.createScratchDir());
  try {
    const artifactDir = join(scratchDir, "artifact");
    await trace.run("render.artifact.materialize", () => dependencies.materialize(files, artifactDir));
    await trace.run("render.job.rendering.persist", () => dependencies.jobs.markRendering(job.id));

    const outputPath = join(scratchDir, "output.mp4");
    const rendered = await trace.run("render.engine.render", () => dependencies.engine.render({
      artifactDir,
      outputPath,
      width: snapshot.width,
      height: snapshot.height,
      fps: snapshot.fps,
      durationSeconds: snapshot.durationSeconds,
      quality: dependencies.qualityFor(job.kind),
    }));

    await trace.run("render.output.validate", async () => assertProbeMatchesSnapshot(rendered.probe, snapshot));

    await trace.run("render.job.uploading.persist", () => dependencies.jobs.markUploading(job.id));
    const bytes = await trace.run("render.output.read", () => dependencies.readOutput(rendered.outputPath));
    const versionId = dependencies.createId();
    const outputObjectKey = dependencies.outputKey(job.projectId, versionId);
    await trace.run("render.output.upload", () => dependencies.upload(outputObjectKey, bytes, "video/mp4"));

    await trace.run("render.version.persist", async () => dependencies.versions.create({
      id: versionId,
      projectId: job.projectId,
      userId: job.userId,
      versionNumber: await trace.run("render.version.number.read", () => dependencies.versions.nextVersionNumber(job.projectId)),
      renderJobId: job.id,
      parentVersionId: job.parentVersionId,
      outputObjectKey,
      kind: job.kind,
      durationSeconds: snapshot.durationSeconds,
      aspectRatio: snapshot.aspectRatio,
      resolution: snapshot.resolution,
      compositionHash: artifact.compositionHash,
    }));

    await trace.run("render.job.succeeded.persist", () => dependencies.jobs.succeed(job.id));
    return { versionId, outputObjectKey };
  } finally {
    await trace.run("render.scratch.cleanup", () => dependencies.removeScratchDir(scratchDir));
  }
}

/** The probe is the real gate: the renderer is best-effort, but a published video must be the frame that was planned. */
function assertProbeMatchesSnapshot(probe: { width: number; height: number; frameRate: number; durationSeconds: number }, snapshot: { width: number; height: number; fps: number; durationSeconds: number }): void {
  if (probe.width !== snapshot.width || probe.height !== snapshot.height) {
    throw new RenderFailure("render_output_invalid", `The render came back ${probe.width}x${probe.height}, not ${snapshot.width}x${snapshot.height}.`);
  }
  if (Math.round(probe.frameRate) !== snapshot.fps) {
    throw new RenderFailure("render_output_invalid", `The render came back at ${probe.frameRate} fps, not ${snapshot.fps}.`);
  }
  if (Math.abs(probe.durationSeconds - snapshot.durationSeconds) > 0.5) {
    throw new RenderFailure("render_output_invalid", `The render came back ${probe.durationSeconds}s long, not ${snapshot.durationSeconds}s.`);
  }
}

function failureCode(error: unknown): string {
  if (error instanceof RenderFailure) return error.code;
  if (error instanceof ArtifactManifestError) return "composition_input_missing";
  if (error instanceof CompositionError) return "composition_input_missing";
  if (error instanceof VideoError) return "composition_input_missing";
  return "render_engine_failed";
}
