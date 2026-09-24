import type { AIService } from "../../domain/ai-service/contracts";
import { AIError } from "../../domain/ai-service/errors";
import type { VideoBriefDraft } from "../../domain/video/brief";
import { findInterviewTurnProblems, type InterviewTurn } from "../../domain/video/interview";
import type { GeneratedBy, VideoMessage, VideoProject } from "../../domain/video/types";
import { INTERVIEW_RESULT_SCHEMA_NAME, VIDEO_AI_SCHEMA_VERSION, interviewResultSchema } from "./ai-schemas";
import { INTERVIEWER_PROMPT_VERSION, interviewerInstructions, transcriptMessages } from "./prompts";

export type InterviewerDependencies = {
  ai: AIService;
  createRequestId: () => string;
};

export type InterviewerCommand = {
  userId: string;
  project: VideoProject;
  /** The stored conversation, already including the message being answered. */
  transcript: readonly VideoMessage[];
  draft: VideoBriefDraft | null;
  assetCount: number;
};

export type InterviewerResult = {
  draft: VideoBriefDraft;
  turn: InterviewTurn | null;
  generatedBy: GeneratedBy;
};

/**
 * One interview turn: the model returns the updated draft and the next question, or a null turn when
 * it believes the brief is finished. That belief is not trusted here; `isBriefDraftComplete`
 * decides, and the caller is the one that acts on it.
 */
export async function runInterviewer(
  command: InterviewerCommand,
  dependencies: InterviewerDependencies,
): Promise<InterviewerResult> {
  const requestId = dependencies.createRequestId();

  const result = await dependencies.ai.generateStructured({
    requestId,
    task: "interviewer",
    context: { userId: command.userId, projectId: command.project.id },
    instructions: interviewerInstructions({ project: command.project, draft: command.draft, assetCount: command.assetCount }),
    messages: transcriptMessages(command.transcript),
    promptVersion: INTERVIEWER_PROMPT_VERSION,
    schema: { name: INTERVIEW_RESULT_SCHEMA_NAME, version: VIDEO_AI_SCHEMA_VERSION, schema: interviewResultSchema },
  });

  const turn = result.data.turn;
  // The output parsed, but a select question with one option, or a recommendation of an option that
  // is not on the list, is not something the UI can present. The provider's answer is unusable.
  if (turn && findInterviewTurnProblems(turn).length > 0) {
    throw new AIError({
      code: "AI_INVALID_OUTPUT",
      safeMessage: "AI provider returned invalid output.",
      requestId,
      retryable: false,
    });
  }

  return {
    draft: result.data.draft,
    turn,
    generatedBy: {
      profileId: result.profileId,
      provider: result.provider,
      model: result.model,
      promptVersion: INTERVIEWER_PROMPT_VERSION,
      requestId,
    },
  };
}
