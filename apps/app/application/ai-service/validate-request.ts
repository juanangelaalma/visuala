import type { ResolvedAIConfig } from "../../domain/ai-service/config";
import { AIError, type AIErrorCode } from "../../domain/ai-service/errors";
import type {
  AIMessage,
  GenerateStructuredRequest,
  GenerateTextRequest,
} from "../../domain/ai-service/types";

export function validateTextRequest(
  request: GenerateTextRequest,
  config: ResolvedAIConfig,
): GenerateTextRequest {
  requireTextCapability(request, config);
  validateRequestInput(request, config);
  return cloneRequest(request);
}

export function validateStructuredRequest<T>(
  request: GenerateStructuredRequest<T>,
  config: ResolvedAIConfig,
): GenerateStructuredRequest<T> {
  requireTextCapability(request, config);
  requireCapability(
    config.capabilities.nativeStructuredOutput,
    request.requestId,
    "Structured output is not supported.",
  );
  validateRequestInput(request, config);
  return { ...cloneRequest(request), schema: { ...request.schema } };
}

function validateRequestInput(
  request: GenerateTextRequest,
  config: ResolvedAIConfig,
): void {
  requireNonemptyFields(request);
  requireValidMessages(request);
  requireInputWithinLimit(request, config);
  requireOutputWithinLimit(request, config);
  requireValidImages(request, config);
}

function requireNonemptyFields(request: GenerateTextRequest): void {
  if (
    !hasText(request.requestId) ||
    !hasText(request.context?.userId) ||
    !hasText(request.instructions) ||
    !hasText(request.promptVersion)
  ) {
    throw requestError(request, "AI request fields are invalid.");
  }
}

function requireValidMessages(request: GenerateTextRequest): void {
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw requestError(request, "AI request messages are invalid.");
  }
  if (request.messages.some((message) => !isValidMessage(message))) {
    throw requestError(request, "AI request messages are invalid.");
  }
}

function isValidMessage(message: AIMessage): boolean {
  return (
    (message.role === "user" || message.role === "assistant") &&
    hasText(message.content)
  );
}

function requireInputWithinLimit(
  request: GenerateTextRequest,
  config: ResolvedAIConfig,
): void {
  const totalCharacters = request.messages.reduce(
    (total, message) => total + message.content.length,
    request.instructions.length,
  );
  if (totalCharacters > config.limits.maxInputCharacters) {
    throw requestError(request, "AI request input is too long.");
  }
}

function requireOutputWithinLimit(
  request: GenerateTextRequest,
  config: ResolvedAIConfig,
): void {
  if (config.limits.maxOutputTokens < 1) {
    throw requestError(request, "AI request output limit is invalid.");
  }
}

function requireValidImages(
  request: GenerateTextRequest,
  config: ResolvedAIConfig,
): void {
  const messagesWithAssets = request.messages.filter(
    (message) => message.assetId,
  );
  if (messagesWithAssets.some((message) => message.role !== "user")) {
    throw requestError(request, "AI request image placement is invalid.");
  }
  const uniqueAssetIds = new Set(
    messagesWithAssets.map((message) => message.assetId),
  );
  if (uniqueAssetIds.size > Math.min(1, config.limits.maxImages)) {
    throw requestError(request, "AI request includes too many images.");
  }
  requireCapability(
    uniqueAssetIds.size === 0 || config.capabilities.vision,
    request.requestId,
    "Image input is not supported.",
  );
}

function requireTextCapability(
  request: GenerateTextRequest,
  config: ResolvedAIConfig,
): void {
  requireCapability(
    config.capabilities.text,
    request.requestId,
    "Text generation is not supported.",
  );
}

function requireCapability(
  supported: boolean,
  requestId: string,
  safeMessage: string,
): void {
  if (!supported) {
    throw aiError("AI_CAPABILITY_UNSUPPORTED", safeMessage, requestId);
  }
}

function cloneRequest<T extends GenerateTextRequest>(request: T): T {
  return {
    ...request,
    context: { ...request.context },
    messages: request.messages.map((message) => ({ ...message })),
  };
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requestError(request: GenerateTextRequest, safeMessage: string): AIError {
  return aiError("AI_INPUT_INVALID", safeMessage, request.requestId);
}

function aiError(
  code: AIErrorCode,
  safeMessage: string,
  requestId: string,
): AIError {
  return new AIError({
    code,
    safeMessage,
    requestId: requestId || "unknown",
    retryable: false,
  });
}
