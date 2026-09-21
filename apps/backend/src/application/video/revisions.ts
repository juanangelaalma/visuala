import { findMissingBriefFields, findUnsupportedCommercialFacts, videoBriefSchema } from "../../domain/video/brief";
import { VideoError } from "../../domain/video/errors";
import { findStoryboardProblems, storyboardSchema, storyboardTotalDurationSeconds } from "../../domain/video/storyboard";
import type {
  VideoBriefRevisionRepository, VideoProjectRepository, VideoStoryboardRevisionRepository,
} from "../../domain/video/contracts";
import type { GeneratedBy, VideoBriefRevision, VideoProject, VideoStoryboardRevision } from "../../domain/video/types";

/**
 * Both revision use cases are internal: the AI orchestration layer calls them after generating a
 * brief or a storyboard, and approval later consumes the rows they write. Neither has a route.
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

export async function saveBriefRevision(command: SaveBriefRevisionCommand, dependencies: BriefRevisionDependencies): Promise<VideoBriefRevision> {
  const project = await requireActiveProject(command.projectId, command.userId, dependencies);

  const parsed = videoBriefSchema.safeParse(command.brief);
  if (!parsed.success) throw invalidInput("The brief does not match the expected shape.");

  // `isComplete` is derived, never supplied: a brief is ready for approval only once every required
  // field for the project's video type is present and every commercial claim is traceable to
  // something the user said or confirmed. The validators read the *parsed* brief, because their
  // satisfaction test is `!== null` and an absent field would read as satisfied.
  const brief = parsed.data;
  const isComplete = findMissingBriefFields(brief, project.videoType).length === 0 && findUnsupportedCommercialFacts(brief).length === 0;

  return dependencies.briefRevisions.create({
    projectId: project.id,
    userId: command.userId,
    schemaVersion: command.schemaVersion,
    // The row records what the orchestrator produced; the parse above only proves it is representable.
    brief: command.brief,
    isComplete,
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
