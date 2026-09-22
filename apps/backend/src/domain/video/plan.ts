import { z } from "zod";
import { videoBriefSchema } from "./brief";
import { storyboardSchema } from "./storyboard";

/** The planner's structured output: the approvable brief and the storyboard built from it. */
export const videoPlanSchema = z
  .object({
    brief: videoBriefSchema,
    storyboard: storyboardSchema,
  })
  .strict();

export type VideoPlan = z.infer<typeof videoPlanSchema>;
