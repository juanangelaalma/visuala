import { z } from "zod";

/** Bump when a field is added or removed: the assistant's controls are stored on the message row. */
export const INTERVIEW_TURN_SCHEMA_VERSION = "v1";

export const INTERVIEW_TURN_CONTROLS = ["single_select", "multi_select", "free_text"] as const;

export const interviewOptionSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1).max(120),
    detail: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

export const interviewTurnSchema = z
  .object({
    question: z.string().trim().min(1).max(400),
    control: z.enum(INTERVIEW_TURN_CONTROLS),
    options: z.array(interviewOptionSchema).max(6),
    recommendedOptionId: z.string().trim().min(1).nullable(),
    recommendationReason: z.string().trim().min(1).max(300).nullable(),
    targetFields: z.array(z.string().trim().min(1)).min(1).max(4),
    briefComplete: z.boolean(),
  })
  .strict();

export type InterviewOption = z.infer<typeof interviewOptionSchema>;
export type InterviewTurn = z.infer<typeof interviewTurnSchema>;

export type InterviewTurnProblem =
  | "options_required"
  | "options_not_allowed"
  | "recommendation_not_listed"
  | "recommendation_reason_missing";

/**
 * The rules JSON Schema cannot express, so they are checked after the model output parses. A
 * recommendation is only usable if it names a listed option and says why, which is what stops a
 * choice from being made silently on the user's behalf.
 */
export function findInterviewTurnProblems(turn: InterviewTurn): readonly InterviewTurnProblem[] {
  const problems = new Set<InterviewTurnProblem>();
  const isSelect = turn.control !== "free_text";

  if (isSelect && turn.options.length < 2) problems.add("options_required");
  if (!isSelect && turn.options.length > 0) problems.add("options_not_allowed");

  if (turn.recommendedOptionId !== null) {
    if (!turn.options.some((option) => option.id === turn.recommendedOptionId)) problems.add("recommendation_not_listed");
    if (turn.recommendationReason === null) problems.add("recommendation_reason_missing");
  }

  return [...problems];
}
