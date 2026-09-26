import type { AIService } from "../../domain/ai-service/contracts";
import {
  BRIEF_SCHEMA_VERSION,
  DRAFT_BRIEF_SCHEMA_VERSION,
  type BriefField,
  commercialFactValues,
  findMissingBriefFields,
  findUnsupportedCommercialFacts,
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
import type { InterviewTurn } from "../../domain/video/interview";
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
  const draft = confirmLatestCommercialFacts(interviewer.draft, transcript);
  const complete = isBriefDraftComplete(draft, activeProject.videoType);
  let project = activeProject;
  let replyContent: string;
  let controls: unknown = null;

  if (!complete) {
    await saveBriefRevision(
      {
        userId: command.userId,
        projectId: activeProject.id,
        schemaVersion: DRAFT_BRIEF_SCHEMA_VERSION,
        brief: draft,
        generatedBy: interviewer.generatedBy,
        sourceMessageIds: [message.id],
      },
      { projects: dependencies.projects, briefRevisions: dependencies.briefRevisions },
    );
    const nextTurn = unresolvedInterviewTurn(draft, activeProject, interviewer.turn, transcript);
    replyContent = nextTurn.question;
    controls = nextTurn;
  } else if (assetIds.length === 0) {
    // A storyboard has to reference a real asset, so the interview cannot close on an empty project.
    // The brief is complete and stored as such; the user just needs to add a photo.
    await saveBriefRevision(
      {
        userId: command.userId,
        projectId: activeProject.id,
        schemaVersion: BRIEF_SCHEMA_VERSION,
        brief: draft,
        generatedBy: interviewer.generatedBy,
        sourceMessageIds: [message.id],
      },
      { projects: dependencies.projects, briefRevisions: dependencies.briefRevisions },
    );
    replyContent = "Brief sudah lengkap. Unggah minimal satu foto produk supaya storyboard bisa disusun.";
  } else {
    // `isBriefDraftComplete` has already proven this parses, so the cast is a narrow, checked one.
    const brief = videoBriefSchema.parse(draft);
    const plan = await runPlanner(
      { userId: command.userId, project: activeProject, transcript, brief, assetIds },
      { ai: dependencies.ai, createRequestId: dependencies.createId },
    );

    const briefRevision = await saveBriefRevision(
      {
        userId: command.userId,
        projectId: activeProject.id,
        schemaVersion: BRIEF_SCHEMA_VERSION,
        brief,
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

function confirmLatestCommercialFacts(draft: VideoBriefDraft, transcript: readonly VideoMessage[]): VideoBriefDraft {
  const latestAnswer = [...transcript].reverse().find((message) => message.role === "user")?.content ?? "";
  const previousQuestion = transcript[transcript.length - 2];
  const confirmed = commercialFactValues(draft)
    .filter(({ field, value }) => !draft.facts.some((fact) => fact.field === field && fact.value === value && fact.source !== "asset_analysis"))
    .flatMap(({ field, value }): VideoBriefDraft["facts"] => {
      if (containsWholeValue(latestAnswer, value)) return [{ field, value, source: "user_message" as const }];
      if (confirmedPreviousQuestion(latestAnswer, previousQuestion, field, value)) return [{ field, value, source: "user_confirmation" as const }];
      return [];
    });
  return confirmed.length ? { ...draft, facts: [...draft.facts, ...confirmed] } : draft;
}

function confirmedPreviousQuestion(answer: string, previous: VideoMessage | undefined, field: string, value: string): boolean {
  if (!/^(ya|iya|betul|benar|setuju)(?:[\s,]+benar)?[.!]?$/iu.test(answer.trim()) || previous?.role !== "assistant") return false;
  return previous.content === confirmationQuestion(field, value);
}

function confirmationQuestion(field: string, value: string): string {
  const label = field === "orderDestination" ? "tujuan pesanan" : field.startsWith("menuItems") ? "harga menu" : "rincian promo";
  return `Mohon konfirmasi ${label} "${value}". Apakah sudah benar?`;
}

function containsWholeValue(message: string, value: string): boolean {
  const index = message.indexOf(value);
  return index >= 0 && !/[\p{L}\p{N}_@]/u.test(message[index - 1] ?? "") && !/[\p{L}\p{N}_]/u.test(message[index + value.length] ?? "");
}

const BRIEF_QUESTIONS: Record<string, string> = {
  productName: "Apa nama produk yang dipromosikan?",
  audience: "Siapa target pembelinya?",
  objective: "Apa tujuan utama videonya?",
  keyMessage: "Apa pesan utama yang ingin disampaikan?",
  offer: "Apa rincian promo yang ingin ditampilkan?",
  callToAction: "Apa ajakan beli untuk penutup video?",
  menuItems: "Apa saja nama dan harga menu yang ingin ditampilkan?",
};

function unresolvedInterviewTurn(draft: VideoBriefDraft, project: VideoProject, turn: InterviewTurn | null, transcript: readonly VideoMessage[]): InterviewTurn {
  const parsed = videoBriefSchema.safeParse(draft);
  const missing: readonly BriefField[] = parsed.success
    ? findMissingBriefFields(parsed.data, project.videoType)
    : (["productName", "audience", "objective", "keyMessage"] as const).filter((field) => draft[field] === null);
  const unsupported = parsed.success ? findUnsupportedCommercialFacts(parsed.data) : [];
  const previousQuestion = transcript[transcript.length - 2];
  if (turn && !/dijelaskan lagi|jelaskan lagi|kalimat lain|parafras/iu.test(turn.question)
    && !(previousQuestion?.role === "assistant" && previousQuestion.content === turn.question)
    && turn.targetFields.some((field) => missing.includes(field as BriefField) || unsupported.includes(field))) return turn;

  const field: string = missing[0] ?? unsupported[0] ?? "keyMessage";
  const value = commercialFactValues(draft).find((fact) => fact.field === field)?.value;
  const question = value
    ? confirmationQuestion(field, value)
    : BRIEF_QUESTIONS[field] ?? (field.startsWith("menuItems") ? "Mohon konfirmasi harga menu yang ingin ditampilkan." : "Apa tujuan pesanan yang ingin ditampilkan?");
  return { question, control: "free_text", options: [], recommendedOptionId: null, recommendationReason: null, targetFields: [field], briefComplete: false };
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
