import { isBriefDraftComplete, videoBriefDraftSchema } from "../../domain/video/brief";
import { VideoError } from "../../domain/video/errors";
import { findStoryboardProblems, storyboardSchema, storyboardTotalDurationSeconds } from "../../domain/video/storyboard";
import type {
  VideoBriefRevisionRepository, VideoProjectRepository, VideoStoryboardRevisionRepository,
} from "../../domain/video/contracts";
import type { GeneratedBy, VideoBriefRevision, VideoProject, VideoStoryboardRevision } from "../../domain/video/types";

/**
 * These use cases are internal: the video orchestration layer calls them after a model turn, and
 * approval later consumes the rows they write. The reads below are what the workspace renders.
 *
 * The repositories own the revision numbering, so `version` is never a caller concern here.
 */
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
 * The one brief write path. It accepts a draft: the interviewer stores what it knows each turn and
 * leaves the rest null, so an unanswerable field is never invented to satisfy a schema.
 *
 * `isComplete` is derived, never supplied. A brief counts as finished only once every required field
 * for the video type is present and every commercial claim traces to something the user said or
 * confirmed, which is what keeps an unfinished draft away from the approval gate.
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

export type StoryboardRevisionDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "getOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "create">;
};

export type SaveStoryboardRevisionCommand = {
  userId: string;
  projectId: string;
  schemaVersion: string;
  briefRevisionId: string;
  scenes: unknown;
  generatedBy: GeneratedBy;
};

export async function saveStoryboardRevision(command: SaveStoryboardRevisionCommand, dependencies: StoryboardRevisionDependencies): Promise<VideoStoryboardRevision> {
  const project = await requireActiveProject(command.projectId, command.userId, dependencies);

  // A storyboard is only meaningful against the brief it was written for, so the referenced
  // revision has to be this caller's and this project's before anything is validated.
  const briefRevision = await dependencies.briefRevisions.getOwned(command.briefRevisionId, command.userId);
  if (!briefRevision || briefRevision.projectId !== command.projectId) throw invalidInput("The brief revision is unavailable for this project.");

  const parsed = storyboardSchema.safeParse({ scenes: command.scenes });
  if (!parsed.success) throw invalidInput("The storyboard does not match the expected shape.");

  const problems = findStoryboardProblems(parsed.data.scenes, project.settings);
  const sceneSeconds = storyboardTotalDurationSeconds(parsed.data.scenes);
  if (problems.length > 0 || sceneSeconds !== project.settings.durationSeconds) throw invalidInput("The storyboard does not fit the project settings.");

  return dependencies.storyboardRevisions.create({
    projectId: project.id,
    userId: command.userId,
    schemaVersion: command.schemaVersion,
    briefRevisionId: briefRevision.id,
    // The validated value is what approval freezes and the renderer consumes, so it is what is stored.
    scenes: parsed.data.scenes,
    // The scenes were just proven to fill the configured duration; taking the stored value from the
    // project keeps the `6 | 10 | 15` column honest instead of casting a computed number.
    totalDurationSeconds: project.settings.durationSeconds,
    generatedBy: command.generatedBy,
  });
}

export type RevisionReadDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "latestOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "latestOwned">;
};

export type BriefRevisionResponse = {
  id: string;
  version: number;
  schemaVersion: string;
  isComplete: boolean;
  brief: unknown;
  createdAt: string;
};

export type StoryboardRevisionResponse = {
  id: string;
  version: number;
  schemaVersion: string;
  briefRevisionId: string;
  scenes: unknown;
  totalDurationSeconds: number;
  approvedAt?: string;
  createdAt: string;
};

/**
 * The latest brief revision, draft or complete. `null` rather than a 404, so the workspace can tell
 * "the interview has not started" apart from "this project is not yours".
 */
export async function getLatestBriefRevision(
  command: { userId: string; projectId: string },
  dependencies: RevisionReadDependencies,
): Promise<BriefRevisionResponse | null> {
  const project = await requireActiveProject(command.projectId, command.userId, dependencies);
  const revision = await dependencies.briefRevisions.latestOwned(project.id, command.userId);
  return revision ? toBriefRevisionResponse(revision) : null;
}

export async function getLatestStoryboardRevision(
  command: { userId: string; projectId: string },
  dependencies: RevisionReadDependencies,
): Promise<StoryboardRevisionResponse | null> {
  const project = await requireActiveProject(command.projectId, command.userId, dependencies);
  const revision = await dependencies.storyboardRevisions.latestOwned(project.id, command.userId);
  return revision ? toStoryboardRevisionResponse(revision) : null;
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

export function toStoryboardRevisionResponse(revision: VideoStoryboardRevision): StoryboardRevisionResponse {
  return {
    id: revision.id,
    version: revision.version,
    schemaVersion: revision.schemaVersion,
    briefRevisionId: revision.briefRevisionId,
    scenes: revision.scenes,
    totalDurationSeconds: revision.totalDurationSeconds,
    ...(revision.approvedAt ? { approvedAt: revision.approvedAt } : {}),
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
