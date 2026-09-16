import type { AIError } from "@/domain/ai-service/errors";
import type { BriefInterpreter, BriefInterpretation } from "@/domain/creative-video/brief-interpreter";
import { CreativeAnalysisError, ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type { CreativeVideoRepository } from "@/domain/creative-video/contracts";
import type { BriefSnapshot, ConversationMessage, CreativeProject, CreativeProjectState } from "@/domain/creative-video/types";

export type ConceptGenerationBoundary = {
  generate(input: { project: CreativeProject; brief: BriefSnapshot }): Promise<void>;
};

export type AnalyzeCreativeProjectDependencies = {
  projects: Pick<CreativeVideoRepository, "getOwnedProject" | "applyBriefAnalysis">;
  interpreter: BriefInterpreter;
  concepts: ConceptGenerationBoundary;
  createId(): string;
  now(): Date;
};

export type AnalyzeCreativeProjectInput = {
  userId: string;
  projectId: string;
  sourceRevision: number;
  requestId: string;
  previousBrief?: BriefSnapshot;
};

export type AnalyzeCreativeProjectResult = {
  state: CreativeProjectState | "concept_generation_started";
  brief: BriefSnapshot;
};

export async function analyzeCreativeProject(
  dependencies: AnalyzeCreativeProjectDependencies,
  input: AnalyzeCreativeProjectInput,
): Promise<AnalyzeCreativeProjectResult> {
  try {
    return await performAnalysis(dependencies, input);
  } catch (error) {
    if (isAIError(error)) throw mapAIError(error);
    throw error;
  }
}

async function performAnalysis(
  dependencies: AnalyzeCreativeProjectDependencies,
  input: AnalyzeCreativeProjectInput,
): Promise<AnalyzeCreativeProjectResult> {
  const aggregate = await requireCurrentProject(dependencies, input);
  const interpretation = await dependencies.interpreter.interpret({
    requestId: input.requestId,
    userId: input.userId,
    projectId: input.projectId,
    category: aggregate.project.category,
    assetId: aggregate.project.assetId,
    previousBrief: input.previousBrief,
    messages: aggregate.messages.filter(isInterviewMessage).map(({ role, text, assetId }) => ({ role, text, assetId })),
  });
  const brief = buildBrief(dependencies, input, aggregate.project.assetId, interpretation);
  return continueFromBrief(dependencies, aggregate.project, brief, interpretation);
}

function isInterviewMessage(message: ConversationMessage): message is ConversationMessage & { role: "user" | "assistant" } {
  return message.role === "user" || message.role === "assistant";
}

async function requireCurrentProject(dependencies: AnalyzeCreativeProjectDependencies, input: AnalyzeCreativeProjectInput) {
  const aggregate = await dependencies.projects.getOwnedProject(input.projectId, input.userId);
  if (!aggregate || aggregate.project.revision !== input.sourceRevision) throw new ProjectRevisionConflictError();
  return aggregate;
}

function buildBrief(
  dependencies: AnalyzeCreativeProjectDependencies,
  input: AnalyzeCreativeProjectInput,
  assetId: string,
  interpretation: BriefInterpretation,
): BriefSnapshot {
  const { analysis } = interpretation;
  return {
    id: dependencies.createId(), projectId: input.projectId, goal: analysis.goal, product: analysis.product.name ?? "unknown",
    facts: analysis.facts.map(({ factKey, value, provenance }) => ({ id: factKey, value, provenance })),
    assumptions: analysis.assumptions,
    missingRequiredQuestions: analysis.missingRequired.map(({ question }) => question),
    optionalQuestions: analysis.optionalQuestions.map(({ question }) => question),
    assetIds: [assetId], pluginSchemaVersion: interpretation.schemaVersion, sourceProjectRevision: input.sourceRevision,
    createdAt: dependencies.now().toISOString(),
  };
}

async function continueFromBrief(
  dependencies: AnalyzeCreativeProjectDependencies,
  project: CreativeProject,
  brief: BriefSnapshot,
  interpretation: BriefInterpretation,
): Promise<AnalyzeCreativeProjectResult> {
  const needsInput = !interpretation.analysis.sufficient || brief.missingRequiredQuestions.length > 0;
  const transitioned = await dependencies.projects.applyBriefAnalysis({
    snapshot: brief, userId: project.userId, expectedRevision: brief.sourceProjectRevision, state: needsInput ? "needs_input" : "analyzing",
  });
  if (needsInput) {
    return { state: transitioned.state, brief };
  }
  await dependencies.concepts.generate({ project: transitioned, brief });
  return { state: "concept_generation_started", brief };
}

function isAIError(error: unknown): error is AIError {
  return error instanceof Error && error.name === "AIError" && "code" in error;
}

function mapAIError(error: AIError): CreativeAnalysisError {
  return new CreativeAnalysisError(error.code === "AI_INVALID_OUTPUT" ? "ANALYSIS_INVALID_OUTPUT" : "ANALYSIS_FAILED");
}
