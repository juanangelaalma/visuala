import type { AIErrorCode, SanitizedDiagnostic } from "./errors";
import type { AIImageLimits } from "./config";
import type {
  AIAttemptOutcome,
  AIAttemptRecord,
  AIOperationOutcome,
  AIOperationRecord,
  GenerateStructuredRequest,
  GenerateTextRequest,
  ProviderStructuredRequest,
  ProviderStructuredResult,
  ProviderTextRequest,
  ProviderTextResult,
  ResolvedAIAsset,
  StructuredResult,
  TextResult,
} from "./types";

export interface AIService {
  generateText(request: GenerateTextRequest): Promise<TextResult>;
  generateStructured<T>(
    request: GenerateStructuredRequest<T>,
  ): Promise<StructuredResult<T>>;
}

export interface ProviderAdapter {
  generateText(request: ProviderTextRequest): Promise<ProviderTextResult>;
  generateStructured(
    request: ProviderStructuredRequest,
  ): Promise<ProviderStructuredResult>;
}

export interface AssetResolver {
  resolve(assetId: string, userId: string, limits: AIImageLimits): Promise<ResolvedAIAsset>;
}

export interface UsageRecorder {
  startOperation(record: AIOperationRecord): Promise<void>;
  finalizeOperation(
    requestId: string,
    outcome: AIOperationOutcome,
  ): Promise<void>;
  startAttempt(record: AIAttemptRecord): Promise<void>;
  finalizeAttempt(attemptId: string, outcome: AIAttemptOutcome): Promise<void>;
  recordDiagnostic(
    requestId: string,
    diagnostic: SanitizedDiagnostic,
    errorCode?: AIErrorCode,
  ): Promise<void>;
}
