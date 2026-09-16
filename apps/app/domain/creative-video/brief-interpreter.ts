import type { BriefSnapshot, VersionRef } from "./types";

export type InterpretedBriefFact = { factKey: string; value: unknown; provenance: "user" | "visual_observation" | "assumption" };
export type InterpretedBriefQuestion = { factKey: string; question: string };
export type BriefAnalysis = {
  goal: string;
  product: { name: string | null; category: string; confidence: number };
  facts: InterpretedBriefFact[];
  assumptions: string[];
  missingRequired: InterpretedBriefQuestion[];
  optionalQuestions: InterpretedBriefQuestion[];
  sufficient: boolean;
};
export type BriefInterpreterInput = {
  requestId: string; userId: string; projectId: string; category: VersionRef; assetId: string;
  messages: readonly { role: "user" | "assistant"; text: string; assetId: string | null }[];
  previousBrief?: BriefSnapshot;
};
export type BriefInterpretation = {
  analysis: BriefAnalysis;
  generation: { requestId: string; promptVersion: string; model: string };
  schemaVersion: string;
};
export interface BriefInterpreter {
  interpret(input: BriefInterpreterInput): Promise<BriefInterpretation>;
}
