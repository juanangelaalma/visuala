import { VideoError } from "../../domain/video/errors";
import type { VideoProjectRepository } from "../../domain/video/contracts";
import { renderInputSnapshotFor } from "../../domain/video-engine/render-input";
import type {
  CompositionArtifactRepository,
  CompositionRevisionRepository,
  OutputKind,
  RenderJob,
  RenderJobRepository,
  VideoVersionRepository,
} from "../../domain/video-engine/contracts";

export type QueueRenderJobDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned" | "transition" | "updateStyle" | "consumeRerender">;
  compositionRevisions: Pick<CompositionRevisionRepository, "getOwned">;
  artifacts: Pick<CompositionArtifactRepository, "findByCompositionRevision">;
  jobs: RenderJobRepository;
  versions: Pick<VideoVersionRepository, "latestOwned">;
  createId: () => string;
  fps: number;
};

export type QueueRenderJobCommand = {
  userId: string;
  projectId: string;
  compositionRevisionId: string;
  kind: OutputKind;
  idempotencyKey: string;
  /** Set when the user is rerendering a previous output, which is what the revision quota counts. */
  parentVersionId?: string;
};

export type QueueRenderJobResult = { job: RenderJob; created: boolean };

/**
 * Queues a preview or an export from a frozen composition. An export additionally requires that a preview
 * of the same composition hash succeeded first, so the user cannot publish a plan they never saw.
 */
export async function queueRenderJob(
  command: QueueRenderJobCommand,
  dependencies: QueueRenderJobDependencies,
): Promise<QueueRenderJobResult> {
  const project = await dependencies.projects.getOwned(command.projectId, command.userId);
  if (!project || project.status === "deleted") throw new VideoError("video_project_not_found", "The video project does not exist.");

  const existing = await dependencies.jobs.findByIdempotencyKey(command.projectId, command.userId, command.idempotencyKey);
  if (existing) return { job: existing, created: false };

  const active = await dependencies.jobs.findActiveForProject(command.projectId, command.userId);
  if (active) throw new VideoError("video_state_conflict", "A render is already running for this project.");

  const revision = await dependencies.compositionRevisions.getOwned(command.compositionRevisionId, command.userId);
  if (!revision || revision.projectId !== command.projectId) {
    throw new VideoError("video_input_invalid", "The composition revision is unavailable for this project.");
  }

  const artifact = await dependencies.artifacts.findByCompositionRevision(revision.id);
  if (!artifact) throw new VideoError("video_input_invalid", "The composition has not been compiled yet.");

  if (command.kind === "final") {
    const preview = await dependencies.versions.latestOwned(command.projectId, command.userId, "preview");
    if (!preview || preview.compositionHash !== artifact.compositionHash) {
      throw new VideoError("video_approval_incomplete", "Preview this composition before exporting it.");
    }
  }

  if (command.kind === "final" && command.parentVersionId) {
    const consumed = await dependencies.projects.consumeRerender(command.projectId, command.userId);
    if (!consumed) throw new VideoError("video_revision_quota_exhausted", "This project has used all of its revisions.");
  }

  const job = await dependencies.jobs.create({
    id: dependencies.createId(),
    projectId: command.projectId,
    userId: command.userId,
    idempotencyKey: command.idempotencyKey,
    compositionArtifactId: artifact.id,
    kind: command.kind,
    parentVersionId: command.parentVersionId,
    isRevision: command.parentVersionId !== undefined,
    inputSnapshot: renderInputSnapshotFor({ project, compositionHash: artifact.compositionHash, fps: dependencies.fps }),
  });

  return { job, created: true };
}
