import type { CategoryPlugin } from "../../../../../domain/creative-video/contracts";
import { fnbBriefAnalysisSchema } from "./fnb-brief-schema";
import { applyFnbFactPolicy, fnbInterviewerInstructions } from "./fnb-interviewer";
import { fnbConceptSetSchema } from "./fnb-concept-schema";

export const fnbCategoryPlugin: CategoryPlugin = {
  ref: { id: "fnb", version: "1" },
  supportedAssetRoles: [],
  brief: {
    schema: fnbBriefAnalysisSchema,
    schemaVersion: "v1",
    interviewerInstructions: fnbInterviewerInstructions,
    interviewerPromptVersion: "fnb-interviewer-v1",
    requiredFacts: ["discount_rule", "starting_price", "whatsapp_contact", "promotion_period"],
    optionalFacts: ["business_name", "flavor", "ingredients", "location"],
    postValidate: (brief, userMessages) => applyFnbFactPolicy(fnbBriefAnalysisSchema.parse(brief), userMessages),
  },
  plan: {
    schema: fnbConceptSetSchema,
    schemaVersion: "v1",
    plannerInstructions: "Generate exactly three distinct F&B video concepts from the trusted brief. Each concept must include a unique hook, unique angle, exactly four unique scene outline entries, fit reason, recommendation reason, and recommendation boolean. Recommend exactly one concept. Never promise or guarantee sales, including the phrase pasti laku.",
    plannerPromptVersion: "fnb-concepts-v1",
    constraints: ["exactly-three-concepts", "exactly-one-recommendation", "four-scenes-per-concept", "no-guaranteed-sales"],
  },
  supportedStyleCapabilities: ["vertical-video"],
  testFixtures: [],
  acceptanceExamples: [],
};
