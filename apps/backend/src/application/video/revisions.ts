import { isBriefDraftComplete, videoBriefDraftSchema } from "../../domain/video/brief";
import { VideoError } from "../../domain/video/errors";
import type { VideoBriefRevisionRepository, VideoProjectRepository } from "../../domain/video/contracts";
import type { GeneratedBy, VideoBriefRevision, VideoProject } from "../../domain/video/types";

/** These use cases are internal, and the repositories own the revision numbering. */
export type BriefRevisionDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "create">;
};

export type SaveBriefRevisionCommand = {
  userId: string;
  projectId: string;
  schemaVersion: string;
  brief: unknown;
  generatedBy: GeneratedBy;
  sourceMessageIds: string[];
};

/**
 * The one brief write path. It accepts a draft: the interviewer stores what it knows each turn and leaves
 * the rest null, so an unanswerable field is never invented to satisfy a schema.
 *
 * `isComplete` is derived, never supplied. A brief is finished only once every required field for the
 * video type is present and every commercial claim traces to something the user said or confirmed.
 */
export async function saveBriefRevision(command: SaveBriefRevisionCommand, dependencies: BriefRevisionDependencies): Promise<VideoBriefRevision> {
  const project = await requireActiveProject(command.projectId, command.userId, dependencies);

  const parsed = videoBriefDraftSchema.safeParse(command.brief);
  if (!parsed.success) throw invalidInput("The brief does not match the expected shape.");

  return dependencies.briefRevisions.create({
    projectId: project.id,
    userId: command.userId,
    schemaVersion: command.schemaVersion,
    // The row records what the orchestrator produced; the parse above only proves it is representable.
    brief: command.brief,
    isComplete: isBriefDraftComplete(parsed.data, project.videoType),
    generatedBy: command.generatedBy,
    sourceMessageIds: command.sourceMessageIds,
  });
}

export type BriefRevisionReadDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "latestOwned">;
};

export type BriefRevisionResponse = {
  id: string;
  version: number;
  schemaVersion: string;
  isComplete: boolean;
  brief: unknown;
  createdAt: string;
};

/**
 * The latest brief revision, draft or complete. `null` rather than a 404, so the workspace can tell
 * "the interview has not started" apart from "this project is not yours".
 */
export async function getLatestBriefRevision(
  command: { userId: string; projectId: string },
  dependencies: BriefRevisionReadDependencies,
): Promise<BriefRevisionResponse | null> {
  const project = await requireActiveProject(command.projectId, command.userId, dependencies);
  const revision = await dependencies.briefRevisions.latestOwned(project.id, command.userId);
  return revision ? toBriefRevisionResponse(revision) : null;
}

/** The only shape a brief revision is allowed to leave the backend in: no `user_id`. */
export function toBriefRevisionResponse(revision: VideoBriefRevision): BriefRevisionResponse {
  return {
    id: revision.id,
    version: revision.version,
    schemaVersion: revision.schemaVersion,
    isComplete: revision.isComplete,
    brief: revision.brief,
    createdAt: revision.createdAt,
  };
}

async function requireActiveProject(
  projectId: string,
  userId: string,
  dependencies: Pick<BriefRevisionDependencies, "projects">,
): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || project.status === "deleted") throw projectNotFound();
  return project;
}

function invalidInput(message: string): VideoError {
  return new VideoError("video_input_invalid", message);
}

function projectNotFound(): VideoError {
  return new VideoError("video_project_not_found", "The video project was not found.");
}
