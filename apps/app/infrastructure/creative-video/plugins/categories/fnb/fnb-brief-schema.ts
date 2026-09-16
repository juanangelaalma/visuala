import { z } from "zod";

const factProvenanceSchema = z.enum(["user", "visual_observation", "assumption"]);
const fnbFactSchema = z.object({
  factKey: z.string().min(1),
  value: z.unknown(),
  provenance: factProvenanceSchema,
});
const fnbQuestionSchema = z.object({
  factKey: z.string().min(1),
  question: z.string().min(1),
});

export const fnbBriefAnalysisSchema = z.object({
  goal: z.string().min(1),
  product: z.object({
    name: z.string().min(1).nullable(),
    category: z.string().min(1),
    confidence: z.number().min(0).max(1),
  }),
  facts: z.array(fnbFactSchema),
  assumptions: z.array(z.string()),
  missingRequired: z.array(fnbQuestionSchema),
  optionalQuestions: z.array(fnbQuestionSchema),
  sufficient: z.boolean(),
});

export type FnbBriefAnalysis = z.infer<typeof fnbBriefAnalysisSchema>;
