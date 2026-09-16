import { z } from "zod";

const guaranteedSalesPattern = /\b(?:pasti\s+laku|dijamin\s+laku|jaminan\s+laku|guaranteed\s+sales?)\b/i;
const requiredText = z.string().trim().min(1).refine((value) => !guaranteedSalesPattern.test(value), "Guaranteed-sales wording is not allowed");

const fnbConceptSchema = z.object({
  id: requiredText,
  title: requiredText,
  hook: requiredText,
  angle: requiredText,
  sceneOutline: z.tuple([requiredText, requiredText, requiredText, requiredText]),
  fitReason: requiredText,
  recommendationReason: requiredText,
  recommended: z.boolean(),
}).strict();

export const fnbConceptSetSchema = z.object({
  concepts: z.tuple([fnbConceptSchema, fnbConceptSchema, fnbConceptSchema]),
}).strict().superRefine(({ concepts }, context) => {
  if (concepts.filter(({ recommended }) => recommended).length !== 1) {
    context.addIssue({ code: "custom", path: ["concepts"], message: "Exactly one concept must be recommended" });
  }
  rejectDuplicates(concepts.map(({ hook }) => hook), "hook", context);
  rejectDuplicates(concepts.map(({ angle }) => angle), "angle", context);
  rejectDuplicates(concepts.flatMap(({ sceneOutline }) => sceneOutline), "scene outline", context);
});

export type FnbConceptSet = z.infer<typeof fnbConceptSetSchema>;

function rejectDuplicates(values: readonly string[], field: string, context: z.RefinementCtx): void {
  const normalized = values.map(normalizeText);
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({ code: "custom", path: ["concepts"], message: `Duplicate normalized ${field}` });
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
