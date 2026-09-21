import { VideoError } from "../../domain/video/errors";
import { MAX_RERENDERS_PER_PROJECT } from "../../domain/video/limits";
import { RENDER_INPUT_SCHEMA_VERSION, renderJobInputSnapshotSchema } from "../../domain/video/render-input";
import { isRenderJobActive } from "../../domain/video/state-machine";
import type {
  VideoBriefRevisionRepository, VideoProjectRepository, VideoRenderJobRepository, VideoStoryboardRevisionRepository, VideoVersionRepository,
} from "../../domain/video/contracts";
import type { VideoProject, VideoRenderJob, VideoRenderJobStatus } from "../../domain/video/types";

/** Mirrors the `char_length(idempotency_key) between 8 and 200` check on `video_render_jobs`. */
const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export type RenderJobDependencies = {
  createId: () => string;
  projects: Pick<VideoProjectRepository, "getOwned" | "transition" | "consumeRerender">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "latestOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "latestOwned">;
  versions: Pick<VideoVersionRepository, "latestOwned">;
  jobs: VideoRenderJobRepository;
};

export type CreateRenderJobCommand = {
  userId: string;
  projectId: string;
  idempotencyKey: string;
};

export type BeginRenderJobCommand = { jobId: string };
export type GetRenderJobCommand = { userId: string; jobId: string; projectId?: string };
export type CancelRenderJobCommand = { userId: string; jobId: string; projectId?: string };

/**
 * The intake for a render. Nothing is rendered here: the durable job row is written, the project
 * moves to `rendering` so no second render can start, and the worker that the render plan owns
 * picks the job up through `beginRenderJob`.
 *
 * Two guarantees decide the order of the steps below. First, a repeated `idempotencyKey` returns
 * the job the first request created, whatever its status, because an idempotent retry must never
 * mint a second version. Second, the rerender quota is checked before any write, so a refused
 * fourth render changes nothing at all.
 */
export async function createRenderJob(
  command: CreateRenderJobCommand,
  dependencies: RenderJobDependencies,
): Promise<{ job: VideoRenderJob; created: boolean }> {
  // The key length is validated before the first read: a malformed request must not touch the
  // database, and the column check would reject it anyway.
  if (command.idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH || command.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new VideoError("video_input_invalid", "The render request needs an idempotency key between 8 and 200 characters.");
  }

  const project = await requireOwnedProject(command.projectId, command.userId, dependencies);

  const existing = await dependencies.jobs.findByIdempotencyKey(project.id, command.userId, command.idempotencyKey);
  if (existing) return { job: existing, created: false };

  const active = await dependencies.jobs.findActiveForProject(project.id, command.userId);
  if (active) throw new VideoError("video_state_conflict", "This project already has a render in progress.");

  if (project.status !== "approved") throw new VideoError("video_state_conflict", `A project in ${project.status} cannot be rendered.`);

  const [briefRevision, storyboardRevision] = await Promise.all([
    dependencies.briefRevisions.latestOwned(project.id, command.userId),
    dependencies.storyboardRevisions.latestOwned(project.id, command.userId),
  ]);
  if (!briefRevision) throw incomplete("A brief is required before rendering.");
  // The approval snapshot is what the user reviewed; a render may only be built from an approved
  // storyboard revision, never from a draft one.
  if (!storyboardRevision?.approvedAt) throw incomplete("The storyboard must be approved before rendering.");

  // A version already exists, so this render supersedes it and is a revision. The quota is checked
  // here, before the transition and before the insert, so a refused render leaves no trace.
  const parentVersion = await dependencies.versions.latestOwned(project.id, command.userId);
  const isRevision = parentVersion !== null;
  if (isRevision && project.revisionRenderCount >= MAX_RERENDERS_PER_PROJECT) {
    throw new VideoError("video_revision_quota_exhausted", "This project has used all three rerenders.");
  }

  // The seed is fixed before any render starts: that is what makes a rerender reproducible. The
  // schema refuses unknown fields, so a field may only be added by raising the schema version.
  const inputSnapshot = renderJobInputSnapshotSchema.parse({
    schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
    briefRevisionId: briefRevision.id,
    storyboardRevisionId: storyboardRevision.id,
    styleId: project.styleId,
    settings: project.settings,
    variantSeed: dependencies.createId(),
  });

  const transitioned = await dependencies.projects.transition(project.id, command.userId, "approved", "rendering");
  if (!transitioned) throw new VideoError("video_state_conflict", "The project is no longer approved.");

  try {
    const created = await dependencies.jobs.create({
      id: dependencies.createId(),
      projectId: project.id,
      userId: command.userId,
      idempotencyKey: command.idempotencyKey,
      briefRevisionId: briefRevision.id,
      storyboardRevisionId: storyboardRevision.id,
      ...(parentVersion ? { parentVersionId: parentVersion.id } : {}),
      isRevision,
      inputSnapshot,
    });
    return { job: created, created: true };
  } catch (error) {
    // Two identical requests raced and the other one won `(project_id, idempotency_key)`: the job it
    // wrote is the job this request means. The project stays in `rendering`, because that job is
    // rendering it.
    if (isUniqueViolation(error)) {
      const raced = await dependencies.jobs.findByIdempotencyKey(project.id, command.userId, command.idempotencyKey);
      if (raced) return { job: raced, created: false };
      throw error;
    }

    // Nothing was queued, so the project must not be left in `rendering`: release it back to
    // `approved` before the failure reaches the caller.
    await dependencies.projects.transition(project.id, command.userId, "rendering", "approved");
    throw error;
  }
}

/**
 * The worker's entry point. It has no session and no route: the render plan's worker calls it for a
 * job it already resolved through an owner-scoped path.
 */
export async function beginRenderJob(command: BeginRenderJobCommand, dependencies: RenderJobDependencies): Promise<VideoRenderJob> {
  const job = await dependencies.jobs.getById(command.jobId);
  if (!job) throw renderJobNotFound();

  // The conditional `queued -> preparing` update is the claim. Losing it means the worker already
  // started this job (or the job can no longer run), so nothing is consumed here.
  const started = await dependencies.jobs.begin(command.jobId);
  if (!started) {
    if (isRenderJobActive(job.status)) return job;
    throw new VideoError("video_state_conflict", `A job in ${job.status} cannot be started.`);
  }

  // The rerender is spent only for a job that supersedes an existing version, and only after the
  // claim above won. A racing worker that lost the claim spends nothing.
  if (job.isRevision) {
    const project = await dependencies.projects.consumeRerender(job.projectId, job.userId);
    if (!project) {
      await dependencies.jobs.fail(job.id, "video_revision_quota_exhausted");
      throw new VideoError("video_revision_quota_exhausted", "This project has used all three rerenders.");
    }
  }

  return started;
}

/**
 * Cancellation is only valid while the job is still `queued`: once the worker holds it, the only
 * way out is the worker's own terminal write. A cancelled job never spent a rerender, so the
 * project returns to `approved` and the user can render again.
 */
export async function cancelRenderJob(command: CancelRenderJobCommand, dependencies: RenderJobDependencies): Promise<VideoRenderJob> {
  const job = await dependencies.jobs.getOwned(command.jobId, command.userId);
  if (!job || !belongsToProject(job, command.projectId)) throw renderJobNotFound();

  const cancelled = await dependencies.jobs.cancel(job.id, command.userId);
  if (!cancelled) throw new VideoError("video_state_conflict", "This render has already started and cannot be cancelled.");

  await dependencies.projects.transition(cancelled.projectId, command.userId, "rendering", "approved");
  return cancelled;
}

/** Reads a job the caller owns, so the status of a render is never visible across accounts. */
export async function getRenderJob(command: GetRenderJobCommand, dependencies: RenderJobDependencies): Promise<VideoRenderJob> {
  const job = await dependencies.jobs.getOwned(command.jobId, command.userId);
  if (!job || !belongsToProject(job, command.projectId)) throw renderJobNotFound();
  return job;
}

export type RenderJobResponse = {
  id: string;
  status: VideoRenderJobStatus;
  isRevision: boolean;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  createdAt: string;
};

/**
 * The only shape a render job is allowed to leave the backend in: no user id, no idempotency key,
 * and no snapshot internals — the frozen brief and settings are the worker's business.
 */
export function toRenderJobResponse(job: VideoRenderJob): RenderJobResponse {
  return {
    id: job.id,
    status: job.status,
    isRevision: job.isRevision,
    attempts: job.attempts,
    queuedAt: job.queuedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    createdAt: job.createdAt,
  };
}

/** Postgres' `unique_violation`, raised by the `(project_id, idempotency_key)` index. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

function belongsToProject(job: VideoRenderJob, projectId: string | undefined): boolean {
  return projectId === undefined || job.projectId === projectId;
}

async function requireOwnedProject(projectId: string, userId: string, dependencies: RenderJobDependencies): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || project.status === "deleted") throw new VideoError("video_project_not_found", "The video project was not found.");
  return project;
}

function renderJobNotFound(): VideoError {
  return new VideoError("video_render_job_not_found", "The render job was not found.");
}

function incomplete(message: string): VideoError {
  return new VideoError("video_approval_incomplete", message);
}
