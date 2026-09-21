import { describe, expect, it, vi } from "vitest";
import { buildApprovalSnapshot } from "./approval";
import { beginRenderJob, cancelRenderJob, createRenderJob, getRenderJob, toRenderJobResponse } from "./render-jobs";
import type { CreateRenderJobInput } from "../../domain/video/contracts";
import type {
  VideoBriefRevision, VideoOutputSettings, VideoProject, VideoRenderJob, VideoStoryboardRevision, VideoVersion,
} from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const STORYBOARD_ID = "55555555-5555-4555-8555-555555555555";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";
/** A brief revision written after approval; the render intake must ignore it in favour of the snapshot. */
const NEWER_BRIEF_ID = "66666666-6666-4666-8666-666666666666";
const APPROVED_AT = "2026-09-21T10:00:00.000Z";
const GENERATED_BY = { profileId: "primary", provider: "9router", model: "router-model", promptVersion: "planner-v1", requestId: "req-1" };

const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

function project(status: VideoProject["status"], revisionRenderCount = 0): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status, settings, revisionRenderCount, createdAt: "created", updatedAt: "updated" };
}

function job(overrides: Partial<VideoRenderJob> = {}): VideoRenderJob {
  return { id: "job-1", projectId: PROJECT_ID, userId: USER_ID, idempotencyKey: "render-0001", briefRevisionId: BRIEF_ID, storyboardRevisionId: STORYBOARD_ID, isRevision: false, status: "queued" as const, attempts: 0, inputSnapshot: {}, queuedAt: "queued", createdAt: "created", updatedAt: "updated", ...overrides };
}

function version(overrides: Partial<VideoVersion> = {}): VideoVersion {
  return { id: VERSION_ID, projectId: PROJECT_ID, userId: USER_ID, versionNumber: 1, renderJobId: "job-0", outputObjectKey: `video-versions/${PROJECT_ID}/${VERSION_ID}.mp4`, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", manifestHash: "hash", createdAt: "created", ...overrides };
}

/** The frozen snapshot approval stamps onto the storyboard revision; it names the approved brief. */
function approvedSnapshot(approvedAt: string) {
  return buildApprovalSnapshot({
    project: { videoType: "product_promo", styleId: "bold_pop", settings },
    briefRevision: { id: BRIEF_ID, version: 1 },
    storyboardRevision: { id: STORYBOARD_ID, version: 1 },
    generatedBy: GENERATED_BY,
    approvedAt,
  });
}

function storyboardRevision(approvedAt: string | null): VideoStoryboardRevision {
  return {
    id: STORYBOARD_ID, projectId: PROJECT_ID, userId: USER_ID, version: 1, schemaVersion: "storyboard@v1",
    briefRevisionId: BRIEF_ID, scenes: [], totalDurationSeconds: 10, generatedBy: GENERATED_BY, createdAt: "created",
    ...(approvedAt === null ? {} : { approvedAt, approvalSnapshot: approvedSnapshot(approvedAt) }),
  };
}

function dependencies(overrides: { status?: VideoProject["status"]; revisionRenderCount?: number; existingJob?: VideoRenderJob | null; activeJob?: VideoRenderJob | null; latestVersion?: Partial<VideoVersion> | null; approvedAt?: string | null } = {}) {
  return {
    createId: () => "99999999-9999-4999-8999-999999999999",
    projects: {
      getOwned: vi.fn(async (): Promise<VideoProject | null> => project(overrides.status ?? "approved", overrides.revisionRenderCount ?? 0)),
      transition: vi.fn(async (): Promise<VideoProject | null> => project("rendering")),
      consumeRerender: vi.fn(async (): Promise<VideoProject | null> => project("rendering", 1)),
    },
    // A brief revision written after approval is present in the repository, but this use case must
    // never consult it: the approved snapshot is authoritative.
    briefRevisions: {
      latestOwned: vi.fn(async (): Promise<VideoBriefRevision | null> => ({ id: NEWER_BRIEF_ID, projectId: PROJECT_ID, userId: USER_ID, version: 2, schemaVersion: "brief@v1", brief: {}, isComplete: true, generatedBy: GENERATED_BY, sourceMessageIds: [], createdAt: "created" })),
    },
    storyboardRevisions: {
      latestOwned: vi.fn(async (): Promise<VideoStoryboardRevision | null> => storyboardRevision(overrides.approvedAt === undefined ? APPROVED_AT : overrides.approvedAt)),
    },
    versions: { latestOwned: vi.fn(async (): Promise<VideoVersion | null> => (overrides.latestVersion ? version(overrides.latestVersion) : null)) },
    jobs: {
      create: vi.fn(async (input: CreateRenderJobInput): Promise<VideoRenderJob> => job({ ...input, isRevision: input.isRevision })),
      findByIdempotencyKey: vi.fn(async (): Promise<VideoRenderJob | null> => overrides.existingJob ?? null),
      findActiveForProject: vi.fn(async (): Promise<VideoRenderJob | null> => overrides.activeJob ?? null),
      getOwned: vi.fn(async (): Promise<VideoRenderJob | null> => job()),
      getById: vi.fn(async (): Promise<VideoRenderJob | null> => job()),
      begin: vi.fn(async (): Promise<VideoRenderJob | null> => job({ status: "preparing" })),
      fail: vi.fn(async (): Promise<VideoRenderJob | null> => job({ status: "failed" })),
      cancel: vi.fn(async (): Promise<VideoRenderJob | null> => job({ status: "cancelled" })),
    },
  };
}

describe("createRenderJob", () => {
  it("queues a job with an immutable snapshot and a stable variant seed", async () => {
    const deps = dependencies();

    const { job: created, created: isNew } = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

    expect(isNew).toBe(true);
    expect(created.status).toBe("queued");
    expect(deps.jobs.create.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT_ID,
      idempotencyKey: "render-0001",
      briefRevisionId: BRIEF_ID,
      storyboardRevisionId: STORYBOARD_ID,
      isRevision: false,
      inputSnapshot: { schemaVersion: "render-input@v1", variantSeed: "99999999-9999-4999-8999-999999999999" },
    });
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "approved", "rendering");
  });

  it("returns the first job for a repeated idempotency key without writing again", async () => {
    const existing = job({ id: "job-existing" });
    const deps = dependencies({ existingJob: existing, status: "rendering" });

    const result = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

    expect(result).toEqual({ job: existing, created: false });
    expect(deps.jobs.create).not.toHaveBeenCalled();
  });

  it("returns the first job when two identical requests race and the second hits the unique index", async () => {
    const deps = dependencies();
    deps.jobs.create.mockRejectedValue({ code: "23505" });
    deps.jobs.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(job({ id: "job-first" }));

    const result = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

    expect(result).toEqual({ job: job({ id: "job-first" }), created: false });
  });

  it("refuses a second, different render request while one is active", async () => {
    const deps = dependencies({ activeJob: job() });

    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0002" }, deps))
      .rejects.toMatchObject({ code: "video_state_conflict" });
    expect(deps.jobs.create).not.toHaveBeenCalled();
  });

  it("refuses a project that is not approved or whose storyboard is unapproved", async () => {
    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, dependencies({ status: "interviewing" })))
      .rejects.toMatchObject({ code: "video_state_conflict" });
    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, dependencies({ approvedAt: null })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("treats a rerender as a revision and refuses the fourth one without changing the project", async () => {
    const revision = dependencies({ latestVersion: { id: VERSION_ID } });
    const result = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, revision);

    expect(result.job.isRevision).toBe(true);
    expect(revision.jobs.create.mock.calls[0]?.[0]).toMatchObject({ isRevision: true, parentVersionId: VERSION_ID });

    const exhausted = dependencies({ latestVersion: { id: VERSION_ID }, revisionRenderCount: 3 });
    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0004" }, exhausted))
      .rejects.toMatchObject({ code: "video_revision_quota_exhausted" });
    expect(exhausted.projects.transition).not.toHaveBeenCalled();
    expect(exhausted.jobs.create).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed idempotency key before reading anything", async () => {
    const deps = dependencies();

    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "short" }, deps)).rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.projects.getOwned).not.toHaveBeenCalled();
  });

  it("releases the project back to approved when the job could not be written", async () => {
    const deps = dependencies();
    deps.jobs.create.mockRejectedValue(new Error("insert failed"));

    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps)).rejects.toThrowError("insert failed");
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
  });

  it("rethrows the unique violation when the racing job cannot be read back", async () => {
    const conflict = { code: "23505" };
    const deps = dependencies();
    deps.jobs.create.mockRejectedValue(conflict);

    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps)).rejects.toBe(conflict);
    expect(deps.projects.transition).toHaveBeenCalledTimes(1);
  });

  it("hides a project the caller does not own", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);

    await expect(createRenderJob({ userId: "user-b", projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
    expect(deps.jobs.findByIdempotencyKey).not.toHaveBeenCalled();
  });

  it("refuses a render whose project left approved before the transition", async () => {
    const deps = dependencies();
    deps.projects.transition.mockResolvedValue(null);

    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps)).rejects.toMatchObject({ code: "video_state_conflict" });
    expect(deps.jobs.create).not.toHaveBeenCalled();
  });

  it("pins the job to the brief in the approved snapshot, not to a newer brief revision", async () => {
    const deps = dependencies();

    const { job: created } = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

    // The repository holds a brief revision written after approval (NEWER_BRIEF_ID), but the job must
    // be built from the brief the snapshot froze, so it never reads the latest brief at all.
    expect(created.briefRevisionId).toBe(BRIEF_ID);
    expect(created.storyboardRevisionId).toBe(STORYBOARD_ID);
    expect(deps.jobs.create.mock.calls[0]?.[0]).toMatchObject({ briefRevisionId: BRIEF_ID, storyboardRevisionId: STORYBOARD_ID });
    expect(deps.briefRevisions.latestOwned).not.toHaveBeenCalled();
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "approved", "rendering");
  });
});

describe("toRenderJobResponse", () => {
  it("projects the job status without the snapshot or the idempotency key", () => {
    const response = toRenderJobResponse(job({ status: "failed", attempts: 2, startedAt: "2026-09-21T00:00:01.000Z", finishedAt: "2026-09-21T00:00:02.000Z", errorCode: "video_revision_quota_exhausted" }));

    expect(response).toEqual({
      id: "job-1",
      status: "failed",
      isRevision: false,
      attempts: 2,
      queuedAt: "queued",
      startedAt: "2026-09-21T00:00:01.000Z",
      finishedAt: "2026-09-21T00:00:02.000Z",
      errorCode: "video_revision_quota_exhausted",
      createdAt: "created",
    });
    expect(JSON.stringify(response)).not.toMatch(/inputSnapshot|idempotencyKey|userId/);
  });
});

describe("beginRenderJob", () => {
  it("consumes exactly one rerender for a revision job", async () => {
    const deps = dependencies();
    deps.jobs.getById.mockResolvedValue(job({ isRevision: true }));

    const started = await beginRenderJob({ jobId: "job-1" }, deps);

    expect(deps.projects.consumeRerender).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    expect(started.status).toBe("preparing");
  });

  it("does not consume a rerender for the first render", async () => {
    const deps = dependencies();

    await beginRenderJob({ jobId: "job-1" }, deps);

    expect(deps.projects.consumeRerender).not.toHaveBeenCalled();
  });

  it("is idempotent once the worker already started", async () => {
    const deps = dependencies();
    deps.jobs.begin.mockResolvedValue(null);
    deps.jobs.getById.mockResolvedValue(job({ status: "rendering" }));

    await expect(beginRenderJob({ jobId: "job-1" }, deps)).resolves.toMatchObject({ status: "rendering" });
    expect(deps.projects.consumeRerender).not.toHaveBeenCalled();
  });

  it("reports the fresh status when the claim is lost, not the stale pre-read row", async () => {
    const deps = dependencies();
    deps.jobs.begin.mockResolvedValue(null);
    deps.jobs.getById
      .mockResolvedValueOnce(job({ status: "queued" }))
      .mockResolvedValueOnce(job({ status: "preparing" }));

    const started = await beginRenderJob({ jobId: "job-1" }, deps);

    expect(started.status).toBe("preparing");
    expect(deps.projects.consumeRerender).not.toHaveBeenCalled();
  });

  it("fails the job when the rerender quota was already spent by a racing request", async () => {
    const deps = dependencies();
    deps.jobs.getById.mockResolvedValue(job({ isRevision: true }));
    deps.projects.consumeRerender.mockResolvedValue(null);

    await expect(beginRenderJob({ jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_revision_quota_exhausted" });
    expect(deps.jobs.fail).toHaveBeenCalledWith("job-1", "video_revision_quota_exhausted");
  });

  it("refuses a cancelled job", async () => {
    const deps = dependencies();
    deps.jobs.begin.mockResolvedValue(null);
    deps.jobs.getById.mockResolvedValue(job({ status: "cancelled" }));

    await expect(beginRenderJob({ jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_state_conflict" });
  });

  it("refuses a job it cannot read", async () => {
    const deps = dependencies();
    deps.jobs.getById.mockResolvedValue(null);

    await expect(beginRenderJob({ jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_render_job_not_found" });
    expect(deps.jobs.begin).not.toHaveBeenCalled();
  });
});

describe("cancelRenderJob", () => {
  it("cancels a queued job, returns the project to approved, and spends no rerender", async () => {
    const deps = dependencies();

    const cancelled = await cancelRenderJob({ userId: USER_ID, jobId: "job-1" }, deps);

    expect(cancelled.status).toBe("cancelled");
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
    expect(deps.projects.consumeRerender).not.toHaveBeenCalled();
  });

  it("refuses to cancel once the worker started", async () => {
    const deps = dependencies();
    deps.jobs.cancel.mockResolvedValue(null);

    await expect(cancelRenderJob({ userId: USER_ID, jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_state_conflict" });
  });

  it("hides another user's job", async () => {
    const deps = dependencies();
    deps.jobs.getOwned.mockResolvedValue(null);

    await expect(cancelRenderJob({ userId: "user-b", jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_render_job_not_found" });
  });
});

describe("getRenderJob", () => {
  it("returns an owned job and hides another user's job", async () => {
    const deps = dependencies();

    await expect(getRenderJob({ userId: USER_ID, projectId: PROJECT_ID, jobId: "job-1" }, deps)).resolves.toMatchObject({ id: "job-1" });

    deps.jobs.getOwned.mockResolvedValue(null);
    await expect(getRenderJob({ userId: "user-b", projectId: PROJECT_ID, jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_render_job_not_found" });
  });

  it("hides a job that belongs to another project", async () => {
    await expect(getRenderJob({ userId: USER_ID, projectId: "66666666-6666-4666-8666-666666666666", jobId: "job-1" }, dependencies()))
      .rejects.toMatchObject({ code: "video_render_job_not_found" });
  });
});
