import type { AIService } from "../../domain/ai-service/contracts";
import {
  BRIEF_SCHEMA_VERSION,
  DRAFT_BRIEF_SCHEMA_VERSION,
  isBriefDraftComplete,
  videoBriefDraftSchema,
  videoBriefSchema,
  type VideoBriefDraft,
} from "../../domain/video/brief";
import type {
  ProjectAssetRepository, VideoBriefRevisionRepository, VideoMessageRepository,
  VideoProjectRepository, VideoStoryboardRevisionRepository,
} from "../../domain/video/contracts";
import { VideoError } from "../../domain/video/errors";
import { STORYBOARD_SCHEMA_VERSION, normalizeStoryboard } from "../../domain/video/storyboard";
import { canMutateProjectAssets } from "../../domain/video/state-machine";
import type { VideoMessage, VideoProject } from "../../domain/video/types";
import { runInterviewer } from "./interviewer";
import { appendVideoMessage } from "./messages";
import { runPlanner } from "./planner";
import { saveBriefRevision, saveStoryboardRevision } from "./revisions";

export type VideoConversationDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned" | "transition">;
  assets: Pick<ProjectAssetRepository, "listOwned">;
  messages: VideoMessageRepository;
  briefRevisions: Pick<VideoBriefRevisionRepository, "create" | "latestOwned" | "getOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "create">;
  ai: AIService;
  createId: () => string;
};

export type VideoInterviewTurnCommand = {
  userId: string;
  projectId: string;
  content: string;
  assetIds?: string[];
};

export type VideoInterviewTurnResult = {
  message: VideoMessage;
  reply: VideoMessage;
  project: VideoProject;
};

/**
 * One chat turn, end to end: store what the user said, ask the interviewer for the updated draft and
 * its next question, and, once the draft is genuinely complete, plan the brief and storyboard and
 * open the project for approval.
 *
 * The user's message is written before the model is called, through the same use case the route used
 * to call on its own, so the `draft -> interviewing` transition stays in one place. If the provider
 * then fails, the message is already in the transcript and the caller sees the AI error; nothing is
 * half-planned.
 */
export async function runVideoInterviewTurn(
  command: VideoInterviewTurnCommand,
  dependencies: VideoConversationDependencies,
): Promise<VideoInterviewTurnResult> {
  await requireMessageableProject(command.projectId, command.userId, dependencies);

  const { message, project: activeProject } = await appendVideoMessage(
    { userId: command.userId, projectId: command.projectId, content: command.content, ...(command.assetIds ? { assetIds: command.assetIds } : {}) },
    { projects: dependencies.projects, messages: dependencies.messages, createId: dependencies.createId },
  );

  const [transcript, latestBrief, assets] = await Promise.all([
    dependencies.messages.listOwned(activeProject.id, command.userId),
    dependencies.briefRevisions.latestOwned(activeProject.id, command.userId),
    dependencies.assets.listOwned(activeProject.id, command.userId),
  ]);

  const interviewer = await runInterviewer(
    {
      userId: command.userId,
      project: activeProject,
      transcript,
      draft: parseDraft(latestBrief?.brief),
      assetCount: assets.length,
    },
    { ai: dependencies.ai, createRequestId: dependencies.createId },
  );

  const assetIds = assets.map((asset) => asset.id);
  const complete = isBriefDraftComplete(interviewer.draft, activeProject.videoType);
  let project = activeProject;
  let replyContent: string;
  let controls: unknown = null;

  if (!complete) {
    await saveBriefRevision(
      {
        userId: command.userId,
        projectId: activeProject.id,
        schemaVersion: DRAFT_BRIEF_SCHEMA_VERSION,
        brief: interviewer.draft,
        generatedBy: interviewer.generatedBy,
        sourceMessageIds: [message.id],
      },
      { projects: dependencies.projects, briefRevisions: dependencies.briefRevisions },
    );
    replyContent = interviewer.turn?.question ?? "Bisa dijelaskan lagi dengan kalimat lain?";
    controls = interviewer.turn;
  } else if (assetIds.length === 0) {
    // A storyboard has to reference a real asset, so the interview cannot close on an empty project.
    // The brief is complete and stored as such; the user just needs to add a photo.
    await saveBriefRevision(
      {
        userId: command.userId,
        projectId: activeProject.id,
        schemaVersion: BRIEF_SCHEMA_VERSION,
        brief: interviewer.draft,
        generatedBy: interviewer.generatedBy,
        sourceMessageIds: [message.id],
      },
      { projects: dependencies.projects, briefRevisions: dependencies.briefRevisions },
    );
    replyContent = "Brief sudah lengkap. Unggah minimal satu foto produk supaya storyboard bisa disusun.";
  } else {
    // `isBriefDraftComplete` has already proven this parses, so the cast is a narrow, checked one.
    const brief = videoBriefSchema.parse(interviewer.draft);
    const plan = await runPlanner(
      { userId: command.userId, project: activeProject, transcript, brief, assetIds },
      { ai: dependencies.ai, createRequestId: dependencies.createId },
    );

    const briefRevision = await saveBriefRevision(
      {
        userId: command.userId,
        projectId: activeProject.id,
        schemaVersion: BRIEF_SCHEMA_VERSION,
        brief: plan.brief,
        generatedBy: plan.generatedBy,
        sourceMessageIds: [message.id],
      },
      { projects: dependencies.projects, briefRevisions: dependencies.briefRevisions },
    );

    await saveStoryboardRevision(
      {
        userId: command.userId,
        projectId: activeProject.id,
        schemaVersion: STORYBOARD_SCHEMA_VERSION,
        briefRevisionId: briefRevision.id,
        scenes: normalizeStoryboard(plan.storyboard.scenes, activeProject.settings, assetIds),
        generatedBy: plan.generatedBy,
      },
      {
        projects: dependencies.projects,
        briefRevisions: dependencies.briefRevisions,
        storyboardRevisions: dependencies.storyboardRevisions,
      },
    );

    project = await enterAwaitingApproval(activeProject, command.userId, dependencies);
    replyContent = "Brief dan storyboard sudah siap. Periksa lalu setujui untuk mulai render.";
  }

  const reply = await dependencies.messages.append({
    id: dependencies.createId(),
    projectId: project.id,
    userId: command.userId,
    role: "assistant",
    content: replyContent,
    ...(controls === null ? {} : { controls }),
  });

  return { message, reply, project };
}

/** A stored draft that no longer parses reads as "no draft" rather than failing the turn. */
function parseDraft(brief: unknown): VideoBriefDraft | null {
  if (brief === null || brief === undefined) return null;
  const parsed = videoBriefDraftSchema.safeParse(brief);
  return parsed.success ? parsed.data : null;
}

/**
 * The interview continues only while the project still accepts changes to its brief. Chat-driven
 * revisions after a render (PRD Story 6) need `revision_planner`, which is a later plan, so those
 * statuses stay closed for now.
 */
async function requireMessageableProject(
  projectId: string,
  userId: string,
  dependencies: Pick<VideoConversationDependencies, "projects">,
): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || project.status === "deleted") throw projectNotFound();
  if (!canMutateProjectAssets(project.status)) {
    throw new VideoError("video_state_conflict", `A project in ${project.status} cannot continue the interview.`);
  }
  return project;
}

async function enterAwaitingApproval(
  project: VideoProject,
  userId: string,
  dependencies: Pick<VideoConversationDependencies, "projects">,
): Promise<VideoProject> {
  const transitioned = await dependencies.projects.transition(project.id, userId, project.status, "awaiting_approval");
  if (transitioned) return transitioned;

  const current = await dependencies.projects.getOwned(project.id, userId);
  if (!current) throw projectNotFound();
  return current;
}

function projectNotFound(): VideoError {
  return new VideoError("video_project_not_found", "The video project was not found.");
}
