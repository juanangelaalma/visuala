import type {
  AIService,
  AssetResolver,
  ProviderAdapter,
  UsageRecorder,
} from "./contracts";
import type { AIError, AIErrorCode, AIErrorInput, SanitizedDiagnostic } from "./errors";
import type {
  AIAttemptSignal,
  AIOperationOutcome,
  AITask,
  EstimatedCost,
  ProviderStructuredRequest,
  ProviderStructuredResult,
  ProviderTextRequest,
  ProviderTextResult,
  ResolvedAIAsset,
  GenerateStructuredRequest,
  GenerateTextRequest,
  StructuredResult,
  TextResult,
} from "./types";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

type ExpectedTask =
  | "connection_test"
  | "interviewer"
  | "planner"
  | "product_analysis";
type ExpectedErrorCode =
  | "AI_CONFIG_ERROR"
  | "AI_CAPABILITY_UNSUPPORTED"
  | "AI_AUTH_ERROR"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_INPUT_INVALID"
  | "AI_INVALID_OUTPUT"
  | "AI_REFUSED"
  | "AI_CANCELLED";
type ExpectedMetadata = {
  requestId: string;
  profileId: string;
  provider: string;
  model: string;
  providerRequestId: string | null;
  attemptCount: number;
  finishReason: "stop" | "length" | "refusal" | "cancelled" | "unknown";
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  estimatedCost: EstimatedCost | null;
  latencyMs: number;
};

export type TaskContract = Assert<Equal<AITask, ExpectedTask>>;
export type ErrorCodeContract = Assert<Equal<AIErrorCode, ExpectedErrorCode>>;
export type RetryAfterInputContract = Assert<Equal<AIErrorInput["retryAfterMs"], number | undefined>>;
export type RetryAfterErrorContract = Assert<Equal<AIError["retryAfterMs"], number | undefined>>;
export type TextResultContract = Assert<
  Equal<TextResult, ExpectedMetadata & { text: string }>
>;
export type StructuredResultContract = Assert<
  Equal<StructuredResult<{ summary: string }>, ExpectedMetadata & { data: { summary: string } }>
>;
export type ResolvedAssetBytesContract = Assert<
  Equal<ResolvedAIAsset["bytes"], Uint8Array>
>;
export type AttemptSignalContract = Assert<
  Equal<AIAttemptSignal["signal"], AbortSignal>
>;
export type AIServiceTextSignature = Assert<
  Equal<AIService["generateText"], (request: GenerateTextRequest) => Promise<TextResult>>
>;
export type AIServiceStructuredSignature = Assert<
  Equal<
    AIService["generateStructured"],
    <T>(request: GenerateStructuredRequest<T>) => Promise<StructuredResult<T>>
  >
>;
export type ProviderTextSignature = Assert<
  Equal<ProviderAdapter["generateText"], (request: ProviderTextRequest) => Promise<ProviderTextResult>>
>;
export type ProviderStructuredSignature = Assert<
  Equal<
    ProviderAdapter["generateStructured"],
    (request: ProviderStructuredRequest) => Promise<ProviderStructuredResult>
  >
>;
export type AssetResolverSignature = Assert<
  Equal<
    AssetResolver["resolve"],
    (assetId: string, userId: string, limits: import("./config").AIImageLimits) => Promise<ResolvedAIAsset>
  >
>;
export type DiagnosticSignature = Assert<
  Equal<Parameters<UsageRecorder["recordDiagnostic"]>[1], SanitizedDiagnostic>
>;
export type OperationCostCompleteContract = Assert<
  Equal<AIOperationOutcome["costComplete"], boolean>
>;

declare const usageRecorder: UsageRecorder;
declare const unsafeDiagnostic: string;

// @ts-expect-error Raw strings can contain prompts, responses, images, or secrets.
usageRecorder.recordDiagnostic("request-1", unsafeDiagnostic);
