import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { claimNextRenderJob, isReclaimDue, reclaimStaleRenderJobs, runRenderJob } from "./render-worker";
import { RENDER_INPUT_SCHEMA_VERSION } from "../../domain/video/render-input";
import { RenderError } from "../../domain/video/errors";
import type { RenderWorkerDependencies } from "./render-worker";
import type { RenderEngineRequest } from "../../domain/video/render-engine";
import type { VideoBrief } from "../../domain/video/brief";
import type { CreateVideoVersionInput } from "../../domain/video/contracts";
import type { VideoOutputSettings, VideoProject, VideoRenderJob, VideoVersion } from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const STORYBOARD_ID = "55555555-5555-4555-8555-555555555555";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-22T00:00:00.000Z";

const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: false, musicEnabled: false };

/**
 * The snapshot a queued job carries. The storyboard's asset ids have to be real uuids because
 * `loadManifest` re-parses the storyboard with its strict schema before building the manifest.
 */
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
    briefRevisionId: BRIEF_ID,
    storyboardRevisionId: STORYBOARD_ID,
    styleId: "bold_pop" as const,
    settings,
    variantSeed: "77777777-7777-4777-8777-777777777777",
    templateId: "product-spotlight",
    templateVersion: "1.0.0",
    stylePackVersion: "1.0.0",
    fps: 30,
    ...overrides,
  };
}

function jobFixture(overrides: Partial<VideoRenderJob> = {}): VideoRenderJob {
  return {
    id: "job-1",
    projectId: PROJECT_ID,
    userId: USER_ID,
    idempotencyKey: "render-0001",
    briefRevisionId: BRIEF_ID,
    storyboardRevisionId: STORYBOARD_ID,
    isRevision: false,
    inputSnapshot: snapshot(),
    status: "preparing",
    attempts: 1,
    queuedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const brief: VideoBrief = {
  productName: "Kopi Nusantara",
  productCategory: null,
  audience: "Pekerja kantor",
  objective: "Menambah pesanan pagi",
  keyMessage: "Seduh pagi jadi lebih mudah",
  offer: null,
  callToAction: "Pesan sekarang",
  orderDestination: null,
  brandName: null,
  styleId: "bold_pop",
  outputSettings: settings,
  menuItems: null,
  facts: [],
};

function scene(order: number, startSeconds: number, endSeconds: number) {
  return {
    order,
    startSeconds,
    endSeconds,
    visual: "Produk tampil dari dekat",
    onScreenTitle: "Kopi Nusantara",
    onScreenCopy: "Seduh pagi jadi lebih mudah",
    voiceOver: null,
    caption: null,
    assetIds: [ASSET_ID],
    audioCue: null,
    transition: "fade" as const,
  };
}

const projectRow: VideoProject = {
  id: PROJECT_ID,
  userId: USER_ID,
  title: "Promo Kopi",
  videoType: "product_promo",
  styleId: "bold_pop",
  status: "rendering",
  settings,
  revisionRenderCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const assetRow = {
  id: ASSET_ID,
  projectId: PROJECT_ID,
  userId: USER_ID,
  objectKey: "video-projects/p/asset-1.png",
  mimeType: "image/png" as const,
  byteSize: 10,
  sha256: "a".repeat(64),
  width: 800,
  height: 800,
  rightsConfirmedAt: NOW,
  moderationStatus: "allowed" as const,
  createdAt: NOW,
};

function versionRow(overrides: Partial<VideoVersion> = {}): VideoVersion {
  return {
    id: VERSION_ID,
    projectId: PROJECT_ID,
    userId: USER_ID,
    versionNumber: 1,
    renderJobId: "job-0",
    outputObjectKey: `video-versions/${PROJECT_ID}/${VERSION_ID}.mp4`,
    durationSeconds: 10,
    aspectRatio: "9:16",
    resolution: "1080p",
    manifestHash: "a".repeat(64),
    createdAt: NOW,
    ...overrides,
  };
}

type WorkerOverrides = {
  isRevision?: boolean;
  jobTimeoutMs?: number;
  snapshot?: unknown;
  latestVersionNumber?: number | null;
  queuedJobs?: VideoRenderJob[];
  staleJobs?: VideoRenderJob[];
  shutdownSignal?: AbortSignal;
};

// No return annotation: the fake has to keep its `vi.fn` types, because the tests drive it with
// `mockRejectedValue` and read `mock.invocationCallOrder`. Assignability is checked at the call sites.
function workerDependencies(overrides: WorkerOverrides = {}) {
  const config = {
    fps: 30,
    quality: "standard" as const,
    pollMs: 2000,
    concurrency: 1,
    jobTimeoutMs: overrides.jobTimeoutMs ?? 600_000,
    staleJobMs: 900_000,
    maxOutputBytes: 524_288_000,
    workRoot: null,
    browserPath: null,
    ffmpegPath: null,
    extractCacheDir: null,
    lowMemoryMode: false,
    maxWorkers: 1,
    disableGpu: true,
  };

  const job = jobFixture({ isRevision: overrides.isRevision ?? false, inputSnapshot: overrides.snapshot ?? snapshot() });

  return {
    createId: () => VERSION_ID,
    now: () => NOW,
    fps: 30,
    config,
    ...(overrides.shutdownSignal ? { shutdownSignal: overrides.shutdownSignal } : {}),
    // A real directory, because the engine fake writes its output into the workspace it is handed.
    createWorkspace: vi.fn(async (jobId: string) => ({
      dir: await mkdtemp(join(tmpdir(), `hf-worker-${jobId}-`)),
      dispose: async () => undefined,
    })),
    projects: {
      transition: vi.fn(async (): Promise<VideoProject | null> => projectRow),
      consumeRerender: vi.fn(async (): Promise<VideoProject | null> => projectRow),
      getOwned: vi.fn(async (): Promise<VideoProject | null> => projectRow),
    },
    assets: {
      listOwned: vi.fn(async () => [assetRow]),
    },
    briefRevisions: {
      getOwned: vi.fn(async () => ({ id: BRIEF_ID, projectId: PROJECT_ID, userId: USER_ID, version: 1, schemaVersion: "v1", brief, isComplete: true, generatedBy: { profileId: "p", provider: "x", model: "m", promptVersion: "v1", requestId: "r" }, sourceMessageIds: [], createdAt: NOW })),
    },
    storyboardRevisions: {
      getOwned: vi.fn(async () => ({ id: STORYBOARD_ID, projectId: PROJECT_ID, userId: USER_ID, version: 1, schemaVersion: "v1", briefRevisionId: BRIEF_ID, scenes: [scene(1, 0, 5), scene(2, 5, 10)], totalDurationSeconds: 10 as const, generatedBy: { profileId: "p", provider: "x", model: "m", promptVersion: "v1", requestId: "r" }, createdAt: NOW })),
    },
    versions: {
      create: vi.fn(async (_input: CreateVideoVersionInput): Promise<VideoVersion> => versionRow()),
      latestOwned: vi.fn(async () => (overrides.latestVersionNumber ? versionRow({ versionNumber: overrides.latestVersionNumber }) : null)),
    },
    jobs: {
      getById: vi.fn(async (): Promise<VideoRenderJob | null> => job),
      begin: vi.fn(async (): Promise<VideoRenderJob | null> => job),
      fail: vi.fn(async (): Promise<VideoRenderJob | null> => jobFixture({ status: "failed" })),
      markRendering: vi.fn(async (): Promise<VideoRenderJob | null> => jobFixture({ status: "rendering" })),
      markUploading: vi.fn(async (): Promise<VideoRenderJob | null> => jobFixture({ status: "uploading" })),
      succeed: vi.fn(async (): Promise<VideoRenderJob | null> => jobFixture({ status: "succeeded" })),
      listQueued: vi.fn(async () => overrides.queuedJobs ?? []),
      listStale: vi.fn(async () => overrides.staleJobs ?? []),
    },
    objectStore: {
      read: vi.fn(async () => Uint8Array.from([137, 80, 78, 71])),
      write: vi.fn(async (_key: string, _bytes: Uint8Array, _mimeType: string): Promise<void> => undefined),
    },
    engine: {
      // The engine's contract is to produce the file at the path it was given, so the fake writes one:
      // the use case reads those bytes back off disk before uploading them.
      render: vi.fn(async (request: RenderEngineRequest) => {
        await writeFile(request.outputPath, "fake-mp4");
        return {
          outputPath: request.outputPath,
          manifestHash: "b".repeat(64),
          probe: { durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 100 },
        };
      }),
    },
  };
}

describe("runRenderJob", () => {
  it("claims, advances every stage in order, publishes a version, and releases the project to ready", async () => {
    const deps = workerDependencies();

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "succeeded" });

    const order = [
      ...deps.jobs.begin.mock.invocationCallOrder,
      ...deps.jobs.markRendering.mock.invocationCallOrder,
      ...deps.engine.render.mock.invocationCallOrder,
      ...deps.jobs.markUploading.mock.invocationCallOrder,
      ...deps.objectStore.write.mock.invocationCallOrder,
      ...deps.versions.create.mock.invocationCallOrder,
      ...deps.jobs.succeed.mock.invocationCallOrder,
      ...deps.projects.transition.mock.invocationCallOrder,
    ];
    expect(order).toEqual([...order].sort((left, right) => left - right));
    // The ordering above cannot show that a stage ran at all, only that what did run ran in order, so
    // each stage of the lifecycle is asserted by name. Without this, dropping a transition outright
    // leaves the suite green.
    expect(deps.jobs.markRendering).toHaveBeenCalledWith("job-1");
    expect(deps.jobs.markUploading).toHaveBeenCalledWith("job-1");
    expect(deps.jobs.succeed).toHaveBeenCalledWith("job-1");
    expect(deps.projects.transition).toHaveBeenLastCalledWith(PROJECT_ID, USER_ID, "rendering", "ready");
    expect(deps.versions.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      renderJobId: "job-1",
      versionNumber: 1,
      outputObjectKey: `video-versions/${PROJECT_ID}/${VERSION_ID}.mp4`,
      durationSeconds: 10,
      aspectRatio: "9:16",
      resolution: "1080p",
      manifestHash: "b".repeat(64),
    }));
  });

  it("uploaded the exact object key it recorded on the version row", async () => {
    const deps = workerDependencies();
    await runRenderJob("job-1", deps);
    const recorded = deps.versions.create.mock.calls[0]?.[0];
    expect(deps.objectStore.write.mock.calls[0]?.[0]).toBe(recorded?.outputObjectKey);
    expect(recorded?.outputObjectKey).toBe(`video-versions/${PROJECT_ID}/${VERSION_ID}.mp4`);
    expect(deps.objectStore.write.mock.calls[0]?.[2]).toBe("video/mp4");
  });

  it("fails the job and releases the project back to approved when the engine cannot render", async () => {
    const deps = workerDependencies();
    deps.engine.render.mockRejectedValue(new RenderError("render_engine_failed", "no"));

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "failed", code: "render_engine_failed" });
    expect(deps.jobs.fail).toHaveBeenCalledWith("job-1", "render_engine_failed");
    expect(deps.versions.create).not.toHaveBeenCalled();
    expect(deps.projects.transition).toHaveBeenLastCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
  });

  it("does not publish a version when the upload fails, and releases the project", async () => {
    const deps = workerDependencies();
    deps.objectStore.write.mockRejectedValue(new Error("storage down"));

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "failed", code: "render_upload_failed" });
    expect(deps.versions.create).not.toHaveBeenCalled();
    expect(deps.jobs.succeed).not.toHaveBeenCalled();
  });

  it("stops without failing anything once the reclaimer has taken the job", async () => {
    const deps = workerDependencies();
    deps.jobs.markRendering.mockResolvedValue(null);

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "skipped" });
    expect(deps.engine.render).not.toHaveBeenCalled();
    expect(deps.jobs.fail).not.toHaveBeenCalled();
  });

  it("writes nothing at all when another worker already holds the job", async () => {
    const deps = workerDependencies();
    // `preparing` is only ever set by the conditional claim, so a row in another status is a job this
    // worker did not win. It must not read, render, fail, or release on behalf of someone else's job.
    deps.jobs.begin.mockResolvedValue(jobFixture({ status: "rendering" }));

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "skipped" });
    expect(deps.engine.render).not.toHaveBeenCalled();
    expect(deps.storyboardRevisions.getOwned).not.toHaveBeenCalled();
    expect(deps.jobs.fail).not.toHaveBeenCalled();
    expect(deps.projects.transition).not.toHaveBeenCalled();
    expect(deps.versions.create).not.toHaveBeenCalled();
  });

  it("aborts a render that outlives the processing budget and fails the job with the timeout code", async () => {
    const deps = workerDependencies({ jobTimeoutMs: 20 });
    deps.engine.render.mockImplementation((request) => new Promise<never>((_resolve, reject) => {
      request.signal?.addEventListener("abort", () => reject(new RenderError("render_engine_failed", "interrupted")));
    }));

    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_timeout" });
  });

  it("aborts an in-flight render when the worker is shutting down, and says so", async () => {
    const shutdown = new AbortController();
    const deps = workerDependencies({ shutdownSignal: shutdown.signal });

    let markStarted!: () => void;
    const renderStarted = new Promise<void>((resolve) => { markStarted = resolve; });
    deps.engine.render.mockImplementation((request) => {
      markStarted();
      return new Promise<never>((_resolve, reject) => {
        request.signal?.addEventListener("abort", () => reject(new RenderError("render_engine_failed", "interrupted")));
      });
    });

    const running = runRenderJob("job-1", deps);
    await renderStarted;
    shutdown.abort();

    // Shutdown is not a timeout: the operator restarted the worker, and the copy says so.
    await expect(running).resolves.toMatchObject({ status: "failed", code: "render_worker_shutdown" });
    expect(deps.jobs.fail).toHaveBeenCalledWith("job-1", "render_worker_shutdown");
    expect(deps.projects.transition).toHaveBeenLastCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
  });

  it("refuses a snapshot it does not understand instead of throwing", async () => {
    const deps = workerDependencies({ snapshot: { schemaVersion: "render-input@v1" } });
    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_input_unsupported" });
  });

  it("refuses to render an asset whose bytes changed after approval", async () => {
    const deps = workerDependencies();
    deps.engine.render.mockRejectedValue(new RenderError("render_asset_mutated", "changed"));
    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_asset_mutated" });
  });

  it("reports an unrecognised throw as an engine failure rather than leaking its text", async () => {
    const deps = workerDependencies();
    deps.engine.render.mockRejectedValue(new Error("Error: page.goto: net::ERR_CONNECTION_REFUSED at chrome"));

    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_engine_failed" });
    expect(deps.jobs.fail).toHaveBeenCalledWith("job-1", "render_engine_failed");
  });

  it("spends the rerender it claimed even when the render then fails, because the claim is the charge", async () => {
    const deps = workerDependencies({ isRevision: true });
    deps.engine.render.mockRejectedValue(new RenderError("render_engine_failed", "no"));

    await runRenderJob("job-1", deps);

    // The project is released so the user can retry, but the quota is not refunded: `consumeRerender`
    // is the only quota mutation in the codebase and it only ever increments.
    expect(deps.projects.transition).toHaveBeenLastCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
    expect(deps.projects.consumeRerender).toHaveBeenCalledTimes(1);
  });

  it("numbers a revision one above the version it supersedes", async () => {
    const deps = workerDependencies({ isRevision: true, latestVersionNumber: 2 });
    await runRenderJob("job-1", deps);
    expect(deps.versions.create).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 3 }));
  });
});

describe("reclaimStaleRenderJobs", () => {
  it("fails each abandoned job and releases its project, and is owner-qualified by the job row", async () => {
    const deps = workerDependencies({ staleJobs: [jobFixture({ id: "job-stale", status: "rendering", projectId: PROJECT_ID, userId: USER_ID })] });

    await expect(reclaimStaleRenderJobs(deps)).resolves.toBe(1);

    expect(deps.jobs.fail).toHaveBeenCalledWith("job-stale", "render_stale");
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
  });

  it("does nothing when there is nothing stale", async () => {
    const deps = workerDependencies({ staleJobs: [] });
    await expect(reclaimStaleRenderJobs(deps)).resolves.toBe(0);
    expect(deps.jobs.fail).not.toHaveBeenCalled();
  });
});

describe("claimNextRenderJob", () => {
  it("returns the oldest queued job and nothing when the queue is empty", async () => {
    const deps = workerDependencies({ queuedJobs: [jobFixture({ id: "job-a", queuedAt: NOW })] });
    await expect(claimNextRenderJob(deps)).resolves.toBe("job-a");

    const empty = workerDependencies({ queuedJobs: [] });
    await expect(claimNextRenderJob(empty)).resolves.toBeNull();
  });
});

describe("isReclaimDue", () => {
  it("says yes at the interval and every time after it", () => {
    expect(isReclaimDue(1_000, 0, 1_000)).toBe(true);
    expect(isReclaimDue(9_999, 0, 1_000)).toBe(true);
  });

  it("says no while the interval is still running", () => {
    expect(isReclaimDue(999, 0, 1_000)).toBe(false);
    expect(isReclaimDue(1_000, 500, 1_000)).toBe(false);
  });
});
