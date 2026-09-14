import type { ZodType } from "zod";
import type { AIErrorCode } from "./errors";

export type AITask =
  | "connection_test"
  | "interviewer"
  | "planner"
  | "product_analysis";

export type AIMessageRole = "user" | "assistant";

export type AIMessage = {
  role: AIMessageRole;
  content: string;
  assetId?: string;
};

export type AIContext = {
  userId: string;
  projectId?: string;
};

type GenerateRequest = {
  requestId: string;
  task: AITask;
  context: AIContext;
  instructions: string;
  messages: AIMessage[];
  promptVersion: string;
  abortSignal?: AbortSignal;
};

export type GenerateTextRequest = GenerateRequest;

export type AISchema<T> = {
  name: string;
  version: string;
  schema: ZodType<T>;
};

export type GenerateStructuredRequest<T> = GenerateRequest & {
  schema: AISchema<T>;
};

export type AIUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type EstimatedCost = {
  amount: number;
  currency: string;
  pricingVersion: string;
  source: string;
};

export type FinishReason =
  | "stop"
  | "length"
  | "refusal"
  | "cancelled"
  | "unknown";

export type AIResultMetadata = {
  requestId: string;
  profileId: string;
  provider: string;
  model: string;
  providerRequestId: string | null;
  attemptCount: number;
  finishReason: FinishReason;
  usage: AIUsage;
  estimatedCost: EstimatedCost | null;
  latencyMs: number;
};

export type TextResult = AIResultMetadata & {
  text: string;
};

export type StructuredResult<T> = AIResultMetadata & {
  data: T;
};

export type ResolvedAIAsset = {
  assetId: string;
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type AIAttemptSignal = {
  attemptId: string;
  attemptNumber: number;
  signal: AbortSignal;
};

export type ProviderRequest = {
  requestId: string;
  instructions: string;
  messages: AIMessage[];
  asset?: ResolvedAIAsset;
  attempt: AIAttemptSignal;
};

export type ProviderTextRequest = ProviderRequest;

export type ProviderStructuredRequest = ProviderRequest & {
  schemaName: string;
  schemaVersion: string;
};

export type ProviderResultMetadata = {
  providerRequestId: string | null;
  model: string;
  finishReason: FinishReason;
  usage: AIUsage;
};

export type ProviderTextResult = ProviderResultMetadata & {
  text: string;
};

export type ProviderStructuredResult = ProviderResultMetadata & {
  json: string;
};

export type AIOperationRecord = {
  requestId: string;
  task: AITask;
  userId: string;
  projectId?: string;
  promptVersion: string;
  schemaName?: string;
  schemaVersion?: string;
  profileId: string;
  provider: string;
  model: string;
};

export type AIAttemptRecord = {
  requestId: string;
  attemptId: string;
  attemptNumber: number;
  profileId: string;
  provider: string;
  model: string;
};

export type AIAttemptOutcome = {
  providerRequestId: string | null;
  latencyMs: number;
  usage: AIUsage;
  errorCode: AIErrorCode | null;
  dispatchOutcome: "not_sent" | "rejected" | "ambiguous";
  usageUnknown: boolean;
  billingUnknown: boolean;
  estimatedCost: EstimatedCost | null;
  costComplete: boolean;
};

export type AIOperationOutcome = {
  latencyMs: number;
  attemptCount: number;
  finishReason: FinishReason | null;
  usage: AIUsage;
  estimatedCost: EstimatedCost | null;
  costComplete: boolean;
  errorCode: AIErrorCode | null;
};
