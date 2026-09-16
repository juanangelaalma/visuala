import type { ZodType } from "zod";
import type {
  BriefSnapshot,
  CompositionVersion,
  Concept,
  ConversationMessage,
  CreativeProject,
  CreativeProjectAggregate,
  CreativeProjectState,
  Scene,
  VersionRef,
  VideoPlan,
} from "./types";

export type CreateCreativeProjectInput = {
  project: CreativeProject;
  message: ConversationMessage;
};

export type CreateCreativeProjectResult = {
  aggregate: CreativeProjectAggregate;
  created: boolean;
};

export type ProjectTransitionInput = {
  projectId: string;
  userId: string;
  expectedRevision: number;
  state: CreativeProjectState;
  patch?: Partial<
    Pick<
      CreativeProject,
      | "activeConceptId"
      | "activeCompositionVersionId"
      | "failedStage"
      | "errorCode"
      | "previewGenerationCount"
    >
  >;
};

export type ApplyBriefAnalysisInput = {
  snapshot: BriefSnapshot;
  userId: string;
  expectedRevision: number;
  state: "analyzing" | "needs_input";
};

export type PersistClarificationAnswerInput = {
  projectId: string;
  userId: string;
  expectedRevision: number;
  message: ConversationMessage;
};

export type PersistClarificationAnswerResult =
  | { status: "created" | "duplicate"; project: CreativeProject }
  | { status: "stale" };

export type ApplyConceptGenerationInput = {
  concepts: readonly Concept[];
  userId: string;
  expectedRevision: number;
  sourceBriefRevision: number;
};

export interface CreativeVideoRepository {
  findByCreateKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<CreativeProjectAggregate | null>;
  create(input: CreateCreativeProjectInput): Promise<CreateCreativeProjectResult>;
  getOwnedProject(
    projectId: string,
    userId: string,
  ): Promise<CreativeProjectAggregate | null>;
  findMessageByKey(
    projectId: string,
    idempotencyKey: string,
  ): Promise<ConversationMessage | null>;
  appendMessage(message: ConversationMessage): Promise<void>;
  persistClarificationAnswer(input: PersistClarificationAnswerInput): Promise<PersistClarificationAnswerResult>;
  applyBriefAnalysis(input: ApplyBriefAnalysisInput): Promise<CreativeProject>;
  applyConceptGeneration(input: ApplyConceptGenerationInput): Promise<CreativeProject>;
  transition(input: ProjectTransitionInput): Promise<CreativeProject>;
}

export type CategoryBriefConfiguration<TBrief> = {
  schema: ZodType<TBrief>;
  schemaVersion: string;
  interviewerInstructions: string;
  interviewerPromptVersion: string;
  requiredFacts: readonly string[];
  optionalFacts: readonly string[];
  postValidate(brief: TBrief, userMessages: readonly string[]): TBrief;
};

export type CategoryPlanConfiguration<TPlan> = {
  schema: ZodType<TPlan>;
  schemaVersion: string;
  plannerInstructions: string;
  plannerPromptVersion: string;
  constraints: readonly string[];
};

export interface CategoryPlugin<TBrief = unknown, TPlan = unknown> {
  ref: VersionRef;
  supportedAssetRoles: readonly string[];
  brief: CategoryBriefConfiguration<TBrief>;
  plan: CategoryPlanConfiguration<TPlan>;
  supportedStyleCapabilities: readonly string[];
  testFixtures: readonly unknown[];
  acceptanceExamples: readonly unknown[];
}

export type StyleTokens = Readonly<Record<string, string | number>>;
export type StyleTextConstraints = {
  headlineMaxLength: number;
  supportingTextMaxLength: number;
};
export type CompiledArtifact = {
  bytes: Uint8Array;
  contentHash: string;
  assetVersions: CompositionVersion["assetVersions"];
};

export interface StylePlugin {
  ref: VersionRef;
  tokens: StyleTokens;
  typographyRequirements: readonly string[];
  layoutIds: readonly string[];
  motionIds: readonly string[];
  sceneConstraints: readonly string[];
  textConstraints: StyleTextConstraints;
  capabilities: readonly string[];
  runtimeDependencies: Readonly<Record<string, string>>;
  compile(plan: VideoPlan): Promise<CompiledArtifact>;
  supportsScene(scene: Scene): boolean;
}
