import type { AnalyzeCreativeProjectDependencies, AnalyzeCreativeProjectInput, AnalyzeCreativeProjectResult } from "./analyze-project";
import { analyzeCreativeProject } from "./analyze-project";
import type { BriefInterpreter } from "@/domain/creative-video/brief-interpreter";
import type { CreativeVideoRepository } from "@/domain/creative-video/contracts";
import { InvalidProjectTransitionError, ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type { BriefSnapshot, ConversationMessage, CreativeProjectAggregate, CreativeProjectState } from "@/domain/creative-video/types";

type ClarificationRepository = Pick<CreativeVideoRepository, "getOwnedProject" | "persistClarificationAnswer" | "applyBriefAnalysis">;

export type AnswerCreativeVideoClarificationDependencies = {
  projects: ClarificationRepository;
  interpreter: BriefInterpreter;
  analyze?: (
    dependencies: AnalyzeCreativeProjectDependencies,
    input: AnalyzeCreativeProjectInput & { previousBrief: BriefSnapshot },
  ) => Promise<AnalyzeCreativeProjectResult>;
  concepts: Parameters<typeof analyzeCreativeProject>[0]["concepts"];
  createId(): string;
  now(): Date;
};

export type AnswerCreativeVideoClarificationInput = {
  projectId: string;
  userId: string;
  expectedRevision: number;
  answer: string;
  idempotencyKey: string;
};

export type AnswerCreativeVideoClarificationResult =
  | { state: CreativeProjectState | "concept_generation_started"; revision: number; duplicate?: boolean; brief: BriefSnapshot }
  | { state: CreativeProjectState; revision: number; duplicate: true };

export async function answerCreativeVideoClarification(
  dependencies: AnswerCreativeVideoClarificationDependencies,
  input: AnswerCreativeVideoClarificationInput,
): Promise<AnswerCreativeVideoClarificationResult> {
  const aggregate = await requireAnswerableProject(dependencies, input);
  const persistence = await dependencies.projects.persistClarificationAnswer({
    projectId: input.projectId,
    userId: input.userId,
    expectedRevision: input.expectedRevision,
    message: buildAnswerMessage(dependencies, input, aggregate.project.state === "needs_input" ? input.expectedRevision + 1 : input.expectedRevision),
  });
  if (persistence.status === "stale") throw new ProjectRevisionConflictError();
  if (persistence.status === "duplicate" && aggregate.project.state !== "analyzing") {
    return { state: persistence.project.state, revision: persistence.project.revision, duplicate: true };
  }
  const analysis = await analyzeWithContext(dependencies, input, aggregate.brief!);
  return { ...analysis, revision: persistence.project.revision + 1, ...(persistence.status === "duplicate" ? { duplicate: true as const } : {}) };
}

async function requireAnswerableProject(
  dependencies: AnswerCreativeVideoClarificationDependencies,
  input: AnswerCreativeVideoClarificationInput,
): Promise<CreativeProjectAggregate> {
  const aggregate = await dependencies.projects.getOwnedProject(input.projectId, input.userId);
  if (!aggregate || aggregate.project.revision !== input.expectedRevision) throw new ProjectRevisionConflictError();
  if (aggregate.project.state !== "needs_input" && aggregate.project.state !== "analyzing") throw new InvalidProjectTransitionError(aggregate.project.state, "analyzing");
  if (!aggregate.brief) throw new ProjectRevisionConflictError();
  return aggregate;
}

function buildAnswerMessage(
  dependencies: AnswerCreativeVideoClarificationDependencies,
  input: AnswerCreativeVideoClarificationInput,
  projectRevision: number,
): ConversationMessage {
  return {
    id: dependencies.createId(), projectId: input.projectId, role: "user", kind: "answer", text: input.answer,
    assetId: null, projectRevision, idempotencyKey: input.idempotencyKey, createdAt: dependencies.now().toISOString(),
  };
}

function analyzeWithContext(
  dependencies: AnswerCreativeVideoClarificationDependencies,
  input: AnswerCreativeVideoClarificationInput,
  previousBrief: BriefSnapshot,
): Promise<AnalyzeCreativeProjectResult> {
  const analysisInput = { projectId: input.projectId, userId: input.userId, sourceRevision: input.expectedRevision + (input.expectedRevision === previousBrief.sourceProjectRevision ? 1 : 0), requestId: input.idempotencyKey, previousBrief };
  if (dependencies.analyze) return dependencies.analyze(dependencies, analysisInput);
  return analyzeCreativeProject(dependencies, analysisInput);
}
