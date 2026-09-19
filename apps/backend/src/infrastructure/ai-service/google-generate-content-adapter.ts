import { z, type ZodType } from "zod";
import type { ProviderAdapter } from "../../domain/ai-service/contracts";
import { AIError, type AIErrorCode } from "../../domain/ai-service/errors";
import type {
  AIMessage,
  AIUsage,
  FinishReason,
  ProviderStructuredRequest,
  ProviderStructuredResult,
  ProviderTextRequest,
  ProviderTextResult,
  ResolvedAIAsset,
} from "../../domain/ai-service/types";

export type GoogleGenerateContentAdapterOptions = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  schemas?: Readonly<Record<string, ZodType>>;
};

type GooglePart = { text?: string; inlineData?: { mimeType: string; data: string } };
type GoogleCandidate = { content?: { parts?: GooglePart[] }; finishReason?: string };
type GoogleResponse = {
  candidates?: GoogleCandidate[];
  promptFeedback?: { blockReason?: string };
  responseId?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
};

const REFUSAL_REASONS = new Set([
  "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION", "ESCALATION", "PUP_LIMITED_DISABLED",
]);
const INVALID_OUTPUT_REASONS = new Set([
  "MALFORMED_FUNCTION_CALL", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS",
  "MISSING_THOUGHT_SIGNATURE", "MALFORMED_RESPONSE", "NO_IMAGE",
]);
const UNAVAILABLE_REASONS = new Set([
  "FINISH_REASON_UNSPECIFIED", "LANGUAGE", "OTHER", "IMAGE_OTHER",
]);

export class GoogleGenerateContentAdapter implements ProviderAdapter {
  constructor(private readonly options: GoogleGenerateContentAdapterOptions) {}

  async generateText(request: ProviderTextRequest): Promise<ProviderTextResult> {
    return this.generate(request, undefined);
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    const schema = this.getNativeSchema(request);
    const result = await this.generate(request, schema);
    return { ...result, json: result.text };
  }

  private getNativeSchema(request: ProviderStructuredRequest): unknown {
    const schema = this.options.schemas?.[schemaKey(request.schemaName, request.schemaVersion)];
    if (!schema) throw configError(request.requestId);
    try {
      return z.toJSONSchema(schema, { unrepresentable: "throw", target: "draft-7" });
    } catch {
      throw configError(request.requestId);
    }
  }

  private async generate(
    request: ProviderTextRequest,
    responseJsonSchema: unknown,
  ): Promise<ProviderTextResult> {
    try {
      return await this.fetchGeneration(request, responseJsonSchema);
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (request.attempt.signal.aborted) throw cancelledError(request.requestId);
      throw ambiguousUnavailableError(request.requestId);
    }
  }

  private async fetchGeneration(request: ProviderTextRequest, responseJsonSchema: unknown): Promise<ProviderTextResult> {
    const response = await fetch(this.operationUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.options.apiKey },
      body: JSON.stringify(this.requestBody(request, responseJsonSchema)),
      redirect: "manual",
      signal: request.attempt.signal,
    });
    if (!response.ok) throw await responseError(response, request.requestId);
    return normalizeResponse(await parseBody(response, request.requestId), this.options.modelId, request.requestId);
  }

  private operationUrl(): string {
    const model = modelResource(this.options.modelId);
    return `${this.options.baseUrl.replace(/\/+$/, "")}/${model.split("/").map(encodeURIComponent).join("/")}:generateContent`;
  }

  private requestBody(request: ProviderTextRequest, responseJsonSchema: unknown): unknown {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: this.options.maxOutputTokens };
    if (responseJsonSchema !== undefined) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseJsonSchema = responseJsonSchema;
    }
    return {
      systemInstruction: { parts: [{ text: request.instructions }] },
      contents: request.messages.map((message) => content(message, request.asset)),
      generationConfig,
    };
  }
}

function content(message: AIMessage, asset: ResolvedAIAsset | undefined): unknown {
  const parts: GooglePart[] = [{ text: message.content }];
  if (message.assetId && asset?.assetId === message.assetId) {
    parts.push({ inlineData: { mimeType: asset.mimeType, data: Buffer.from(asset.bytes).toString("base64") } });
  }
  return { role: message.role === "assistant" ? "model" : "user", parts };
}

async function parseBody(response: Response, requestId: string): Promise<GoogleResponse> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid response");
    return body as GoogleResponse;
  } catch {
    throw aiError("AI_INVALID_OUTPUT", "AI provider returned an invalid response.", requestId, false);
  }
}

function normalizeResponse(body: GoogleResponse, model: string, requestId: string): ProviderTextResult {
  const providerRequestId = typeof body.responseId === "string" ? body.responseId : null;
  if (body.promptFeedback?.blockReason) throw refusedError(requestId, providerRequestId);
  const candidate = body.candidates?.[0];
  requireSuccessfulFinish(candidate?.finishReason, requestId, providerRequestId);
  const text = candidate?.content?.parts?.filter((part) => typeof part.text === "string").map((part) => part.text).join("");
  if (!text) throw invalidOutputError(requestId, providerRequestId);
  return { text, model, providerRequestId, finishReason: finishReason(candidate?.finishReason), usage: usage(body) };
}

function finishReason(reason: string | undefined): FinishReason {
  if (reason === "STOP") return "stop";
  if (reason === "MAX_TOKENS") return "length";
  return "unknown";
}

function requireSuccessfulFinish(reason: string | undefined, requestId: string, providerRequestId: string | null): void {
  if (reason === "STOP" || reason === "MAX_TOKENS") return;
  if (reason && REFUSAL_REASONS.has(reason)) throw refusedError(requestId, providerRequestId);
  if (reason && INVALID_OUTPUT_REASONS.has(reason)) throw invalidOutputError(requestId, providerRequestId);
  if (reason && UNAVAILABLE_REASONS.has(reason)) throw finishUnavailableError(requestId, providerRequestId);
  throw invalidOutputError(requestId, providerRequestId);
}

function usage(body: GoogleResponse): AIUsage {
  return {
    inputTokens: integerOrNull(body.usageMetadata?.promptTokenCount),
    outputTokens: integerOrNull(body.usageMetadata?.candidatesTokenCount),
    totalTokens: integerOrNull(body.usageMetadata?.totalTokenCount),
  };
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

async function responseError(response: Response, requestId: string): Promise<AIError> {
  const status = response.status;
  const providerRequestId = response.headers.get("x-request-id") ?? response.headers.get("x-goog-request-id") ?? await responseId(response);
  if (status === 400) return aiError("AI_INPUT_INVALID", "AI provider rejected the request.", requestId, false, { providerStatus: status, providerRequestId });
  if (status === 401 || status === 403) return aiError("AI_AUTH_ERROR", "AI provider authentication failed.", requestId, false, { providerStatus: status, providerRequestId });
  if (status === 429) return rateLimitError(response, requestId, providerRequestId);
  if (status >= 500 && status <= 599) return aiError("AI_UNAVAILABLE", "AI provider is unavailable.", requestId, true, { providerStatus: status, providerRequestId });
  return aiError("AI_UNAVAILABLE", "AI provider returned an unexpected response.", requestId, false, { providerStatus: status, providerRequestId });
}

async function responseId(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("responseId" in body)) return undefined;
    return typeof body.responseId === "string" ? body.responseId : undefined;
  } catch {
    return undefined;
  }
}

function rateLimitError(response: Response, requestId: string, providerRequestId: string | undefined): AIError {
  return aiError("AI_RATE_LIMITED", "AI provider rate limit reached.", requestId, true, {
    providerStatus: 429,
    providerRequestId,
    retryAfterMs: retryAfterMs(response.headers.get("retry-after")) ?? undefined,
  });
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1_000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

function configError(requestId: string): AIError {
  return aiError("AI_CONFIG_ERROR", "AI service configuration is invalid.", requestId, false);
}

function cancelledError(requestId: string): AIError {
  return aiError("AI_CANCELLED", "AI request was cancelled.", requestId, false);
}

function ambiguousUnavailableError(requestId: string): AIError {
  return new AIError({ code: "AI_UNAVAILABLE", safeMessage: "AI provider is unavailable.", requestId,
    retryable: false, dispatchOutcome: "ambiguous" });
}

function refusedError(requestId: string, providerRequestId: string | null): AIError {
  return aiError("AI_REFUSED", "AI provider refused the request.", requestId, false, { providerRequestId: providerRequestId ?? undefined });
}

function invalidOutputError(requestId: string, providerRequestId: string | null): AIError {
  return aiError("AI_INVALID_OUTPUT", "AI provider returned an invalid response.", requestId, false, { providerRequestId: providerRequestId ?? undefined });
}

function finishUnavailableError(requestId: string, providerRequestId: string | null): AIError {
  return aiError("AI_UNAVAILABLE", "AI provider could not complete the request.", requestId, false, { providerRequestId: providerRequestId ?? undefined });
}

type AIErrorMetadata = {
  providerStatus?: number;
  providerRequestId?: string;
  retryAfterMs?: number;
};

function aiError(
  code: AIErrorCode,
  safeMessage: string,
  requestId: string,
  retryable: boolean,
  metadata: AIErrorMetadata = {},
): AIError {
  return new AIError({
    code,
    safeMessage,
    requestId,
    retryable,
    ...(metadata.providerStatus === undefined ? {} : { providerStatus: metadata.providerStatus }),
    ...(metadata.providerRequestId ? { providerRequestId: metadata.providerRequestId } : {}),
    ...(metadata.retryAfterMs === undefined ? {} : { retryAfterMs: metadata.retryAfterMs }),
  });
}

function schemaKey(name: string, version: string): string {
  return `${name}@${version}`;
}

function modelResource(modelId: string): string {
  if (modelId.startsWith("/") || modelId.includes("?") || modelId.includes("#")) throw configError("configuration");
  const segments = modelId.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw configError("configuration");
  return segments.length === 1 ? `models/${modelId}` : modelId;
}
