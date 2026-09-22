import { z, type ZodType } from "zod";
import { videoBriefDraftSchema } from "../../domain/video/brief";
import { interviewTurnSchema } from "../../domain/video/interview";
import { videoPlanSchema } from "../../domain/video/plan";

/** Bump together with the domain schemas: the adapter exposes this version to the provider. */
export const VIDEO_AI_SCHEMA_VERSION = "v1";

export const INTERVIEW_RESULT_SCHEMA_NAME = "interview_result";
export const PLANNER_RESULT_SCHEMA_NAME = "video_plan";

/** What the interviewer returns: the updated draft plus the next question, or null when finished. */
export const interviewResultSchema = z
  .object({
    draft: videoBriefDraftSchema,
    turn: interviewTurnSchema.nullable(),
  })
  .strict();

export type InterviewResult = z.infer<typeof interviewResultSchema>;

/**
 * The schemas the video orchestrator registers with the AI service. Keys are `name@version`, the
 * format `createAIService` validates and the adapter looks up.
 */
export const VIDEO_AI_SCHEMAS: Readonly<Record<string, ZodType>> = {
  [`${INTERVIEW_RESULT_SCHEMA_NAME}@${VIDEO_AI_SCHEMA_VERSION}`]: interviewResultSchema,
  [`${PLANNER_RESULT_SCHEMA_NAME}@${VIDEO_AI_SCHEMA_VERSION}`]: videoPlanSchema,
};
