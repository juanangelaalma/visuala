import { VideoError } from "../../domain/video/errors";
import type { VideoProjectRepository } from "../../domain/video/contracts";
import type {
  CompositionArtifactRepository,
  CompositionRevision,
  CompositionRevisionRepository,
  RenderJob,
  RenderJobRepository,
  VideoVersion,
  VideoVersionRepository,
} from "../../domain/video-engine/contracts";

export type CompositionReadDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned">;
  compositionRevisions: Pick<CompositionRevisionRepository, "latestOwned" | "listOwned" | "getOwned">;
  artifacts: Pick<CompositionArtifactRepository, "findByCompositionRevision">;
  jobs: Pick<RenderJobRepository, "latestOwned" | "getOwned" | "cancel">;
  versions: Pick<VideoVersionRepository, "latestOwned">;
  /** Mints the short-lived URL for the preview, which is the artefact the user approves. */
  signedUrl: (objectKey: string) => Promise<string | null>;
};

/** `user_id`, the idempotency key, and any storage key never leave the backend. */
export type RenderJobResponse = {
  id: string;
  kind: RenderJob["kind"];
  status: RenderJob["status"];
  attempts: number;
  isRevision: boolean;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
};

export type CompositionResponse = {
  id: string;
  version: number;
  schemaVersion: string;
  designPack: { id: string; version: string };
  isFallback: boolean;
  validationIssues: unknown;
  candidates: unknown;
  spec: unknown;
  createdAt: string;
  /** True once a preview of exactly these bytes succeeded, which is the same predicate approval uses. */
  previewReady: boolean;
  /** The preview the user watches before approving. Null until one has rendered. */
  previewUrl: string | null;
  latestJob: RenderJobResponse | null;
};

export async function listCompositionRevisions(
  command: { userId: string; projectId: string; limit: number },
  dependencies: CompositionReadDependencies,
): Promise<CompositionResponse[]> {
  await requireOwnedProject(command.projectId, command.userId, dependencies);
  const [revisions, preview, job] = await Promise.all([
    dependencies.compositionRevisions.listOwned(command.projectId, command.userId, command.limit),
    dependencies.versions.latestOwned(command.projectId, command.userId, "preview"),
    dependencies.jobs.latestOwned(command.projectId, command.userId),
  ]);
  return Promise.all(revisions.map((revision) => toCompositionResponse(revision, preview, job, dependencies)));
}

export async function getLatestComposition(
  command: { userId: string; projectId: string },
  dependencies: CompositionReadDependencies,
): Promise<CompositionResponse | null> {
  await requireOwnedProject(command.projectId, command.userId, dependencies);
  const revision = await dependencies.compositionRevisions.latestOwned(command.projectId, command.userId);
  if (!revision) return null;
  const [preview, job] = await Promise.all([
    dependencies.versions.latestOwned(command.projectId, command.userId, "preview"),
    dependencies.jobs.latestOwned(command.projectId, command.userId),
  ]);
  return toCompositionResponse(revision, preview, job, dependencies);
}

export async function getRenderJob(
  command: { userId: string; projectId: string; jobId: string },
  dependencies: CompositionReadDependencies,
): Promise<RenderJob> {
  await requireOwnedProject(command.projectId, command.userId, dependencies);
  const job = await dependencies.jobs.getOwned(command.jobId, command.userId);
  if (!job || job.projectId !== command.projectId) throw new VideoError("video_render_job_not_found", "The render job does not exist.");
  return job;
}

export async function getLatestRenderJob(
  command: { userId: string; projectId: string },
  dependencies: CompositionReadDependencies,
): Promise<RenderJob | null> {
  await requireOwnedProject(command.projectId, command.userId, dependencies);
  return dependencies.jobs.latestOwned(command.projectId, command.userId);
}

export async function cancelRenderJob(
  command: { userId: string; projectId: string; jobId: string },
  dependencies: CompositionReadDependencies,
): Promise<RenderJob> {
  const job = await getRenderJob(command, dependencies);
  const cancelled = await dependencies.jobs.cancel(job.id, command.userId);
  if (!cancelled) throw new VideoError("video_state_conflict", "The render job can no longer be cancelled.");
  return cancelled;
}

export function toRenderJobResponse(job: RenderJob): RenderJobResponse {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    isRevision: job.isRevision,
    queuedAt: job.queuedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
  };
}

async function toCompositionResponse(
  revision: CompositionRevision,
  preview: VideoVersion | null,
  latestJob: RenderJob | null,
  dependencies: CompositionReadDependencies,
): Promise<CompositionResponse> {
  const artifact = await dependencies.artifacts.findByCompositionRevision(revision.id);
  const report = revision.validationReport as { issues?: unknown } | null;

  return {
    id: revision.id,
    version: revision.version,
    schemaVersion: revision.schemaVersion,
    designPack: { id: revision.designPackId, version: revision.designPackVersion },
    isFallback: revision.isFallback,
    validationIssues: report?.issues ?? [],
    candidates: revision.candidates,
    spec: revision.spec,
    createdAt: revision.createdAt,
    previewReady: matchesComposition(preview, artifact?.compositionHash ?? null),
    previewUrl: matchesComposition(preview, artifact?.compositionHash ?? null) ? await dependencies.signedUrl(preview!.outputObjectKey) : null,
    latestJob: latestJob ? toRenderJobResponse(latestJob) : null,
  };
}

/** A preview only counts for this composition when it rendered exactly these bytes. */
function matchesComposition(preview: VideoVersion | null, compositionHash: string | null): boolean {
  return preview !== null && compositionHash !== null && preview.compositionHash === compositionHash;
}

async function requireOwnedProject(
  projectId: string,
  userId: string,
  dependencies: Pick<CompositionReadDependencies, "projects">,
): Promise<void> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || project.status === "deleted") throw new VideoError("video_project_not_found", "The video project does not exist.");
}
