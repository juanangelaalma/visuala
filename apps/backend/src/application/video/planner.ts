import type { AIService } from "../../domain/ai-service/contracts";
import type { VideoBrief } from "../../domain/video/brief";
import type { Storyboard } from "../../domain/video/storyboard";
import type { GeneratedBy, VideoMessage, VideoProject } from "../../domain/video/types";
import { PLANNER_RESULT_SCHEMA_NAME, VIDEO_AI_SCHEMA_VERSION } from "./ai-schemas";
import { videoPlanSchema } from "../../domain/video/plan";
import { PLANNER_PROMPT_VERSION, plannerInstructions, transcriptMessages } from "./prompts";

export type PlannerDependencies = {
  ai: AIService;
  createRequestId: () => string;
};

export type PlannerCommand = {
  userId: string;
  project: VideoProject;
  transcript: readonly VideoMessage[];
  brief: VideoBrief;
  assetIds: readonly string[];
};

export type PlannerResult = {
  brief: VideoBrief;
  storyboard: Storyboard;
  generatedBy: GeneratedBy;
};

/**
 * Turns a complete brief into a storyboard. The scenes come back as the model wrote them; making
 * them fit the timeline is `normalizeStoryboard`'s job, so this stays a thin mapping over the model
 * result plus its provenance.
 */
export async function runPlanner(command: PlannerCommand, dependencies: PlannerDependencies): Promise<PlannerResult> {
  const requestId = dependencies.createRequestId();

  const result = await dependencies.ai.generateStructured({
    requestId,
    task: "planner",
    context: { userId: command.userId, projectId: command.project.id },
    instructions: plannerInstructions({ project: command.project, brief: command.brief, assetIds: command.assetIds }),
    messages: transcriptMessages(command.transcript),
    promptVersion: PLANNER_PROMPT_VERSION,
    schema: { name: PLANNER_RESULT_SCHEMA_NAME, version: VIDEO_AI_SCHEMA_VERSION, schema: videoPlanSchema },
  });

  return {
    brief: result.data.brief,
    storyboard: result.data.storyboard,
    generatedBy: {
      profileId: result.profileId,
      provider: result.provider,
      model: result.model,
      promptVersion: PLANNER_PROMPT_VERSION,
      requestId,
    },
  };
}
