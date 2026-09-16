export const creativeProjectStates = [
  "draft",
  "analyzing",
  "needs_input",
  "concepts_ready",
  "building_preview",
  "preview_ready",
  "rendering",
  "completed",
  "failed",
] as const;

export type CreativeProjectState = (typeof creativeProjectStates)[number];
export type CreativeProcessingState =
  | "analyzing"
  | "building_preview"
  | "rendering";
export type CreativeFailedStage =
  | "analysis"
  | "planning"
  | "compilation"
  | "rendering";
export type VersionRef = { id: string; version: string };
export type CreativeCategory = VersionRef;

export type CreativeProject = {
  id: string;
  userId: string;
  createIdempotencyKey: string;
  category: CreativeCategory;
  state: CreativeProjectState;
  revision: number;
  assetId: string;
  activeConceptId: string | null;
  activeCompositionVersionId: string | null;
  failedStage: CreativeFailedStage | null;
  errorCode: string | null;
  previewGenerationCount: number;
  previewQuota: number;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessageRole = "user" | "assistant" | "system";
export type ConversationMessageKind =
  | "brief"
  | "clarification"
  | "answer"
  | "status";

export type ConversationMessage = {
  id: string;
  projectId: string;
  role: ConversationMessageRole;
  kind: ConversationMessageKind;
  text: string;
  assetId: string | null;
  projectRevision: number;
  idempotencyKey: string;
  createdAt: string;
};

export type FactProvenance = "user" | "visual_observation" | "assumption";
export type BriefFact = {
  id: string;
  value: unknown;
  provenance: FactProvenance;
};

export type BriefSnapshot = {
  id: string;
  projectId: string;
  goal: string;
  product: string;
  facts: readonly BriefFact[];
  assumptions: readonly string[];
  missingRequiredQuestions: readonly string[];
  optionalQuestions: readonly string[];
  assetIds: readonly string[];
  pluginSchemaVersion: string;
  sourceProjectRevision: number;
  createdAt: string;
};

export type ConceptGenerationMetadata = {
  requestId: string;
  promptVersion: string;
  model: string;
};

export type Concept = {
  id: string;
  projectId: string;
  briefSnapshotId: string;
  title: string;
  hook: string;
  angle: string;
  sceneOutline: readonly [string, string, string, string];
  fitReason: string;
  recommendationReason: string;
  recommended: boolean;
  order: number;
  generation: ConceptGenerationMetadata;
  createdAt: string;
};

export type FocalPoint = { x: number; y: number };
export type Scene = {
  id: string;
  purpose: string;
  layoutId: string;
  durationSeconds: number;
  headline: string;
  supportingText: string | null;
  assetId: string;
  fit: "cover" | "contain";
  focalPoint: FocalPoint | null;
  motionId: string;
  factReferences: readonly string[];
};

export type VideoPlan = {
  schemaVersion: string;
  category: CreativeCategory;
  style: VersionRef;
  durationSeconds: 12;
  aspectRatio: "9:16";
  scenes: readonly [Scene, Scene, Scene, Scene];
  factReferences: readonly string[];
  sourceConceptId: string;
};

export type AssetVersion = {
  assetId: string;
  version: string;
  contentHash: string;
};
export type CompositionValidationStatus = "pending" | "valid" | "invalid";

export type CompositionVersion = {
  id: string;
  projectId: string;
  version: number;
  plan: VideoPlan;
  artifactObjectKey: string;
  contentHash: string;
  assetVersions: readonly AssetVersion[];
  validationStatus: CompositionValidationStatus;
  sourceProjectRevision: number;
  createdAt: string;
};

export type ExportRequest = {
  id: string;
  userId: string;
  projectId: string;
  compositionVersionId: string;
  idempotencyKey: string;
  priceCredits: 0;
  createdAt: string;
};

export type RenderJobStatus =
  | "queued"
  | "rendering"
  | "completed"
  | "failed";
export type RenderJob = {
  id: string;
  exportRequestId: string;
  compositionVersionId: string;
  status: RenderJobStatus;
  attempts: number;
  progress: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  outputAssetId: string | null;
  errorStage: "rendering" | "verification" | "upload" | null;
  errorCode: string | null;
  rendererVersion: string;
  toolchainVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type CreativeProjectAggregate = {
  project: CreativeProject;
  messages: readonly ConversationMessage[];
  brief: BriefSnapshot | null;
  concepts: readonly Concept[];
};
