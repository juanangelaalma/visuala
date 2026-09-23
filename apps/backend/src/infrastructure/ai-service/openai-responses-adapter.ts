import { z, type ZodType } from "zod";
import type { ProviderAdapter } from "../../domain/ai-service/contracts";
import { AIError, type AIErrorCode } from "../../domain/ai-service/errors";
import type {
  AIMessage,
  AIUsage,
  ProviderStructuredRequest,
  ProviderStructuredResult,
  ProviderTextRequest,
  ProviderTextResult,
  ResolvedAIAsset,
} from "../../domain/ai-service/types";

export type OpenAIResponsesAdapterOptions = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  schemas?: Readonly<Record<string, ZodType>>;
};

type ResponseFormat = {
  type: "json_schema";
  name: string;
  schema: unknown;
  strict: true;
};

type OpenAIOutputContent =
  | { type: "output_text"; text?: unknown }
  | { type: "refusal"; refusal?: unknown }
  | { type: string; [key: string]: unknown };

type OpenAIResponse = {
  id?: unknown;
  status?: unknown;
  model?: unknown;
  output?: unknown;
  incomplete_details?: { reason?: unknown } | null;
  usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown } | null;
};

export class OpenAIResponsesAdapter implements ProviderAdapter {
  constructor(private readonly options: OpenAIResponsesAdapterOptions) {}

  async generateText(request: ProviderTextRequest): Promise<ProviderTextResult> {
    return this.generate(request, undefined);
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    const result = await this.generate(request, this.getResponseFormat(request));
    return { ...result, json: result.text };
  }

  private getResponseFormat(request: ProviderStructuredRequest): ResponseFormat {
    const schema = this.options.schemas?.[`${request.schemaName}@${request.schemaVersion}`];
    if (!schema) throw configError(request.requestId);
    try {
      return {
        type: "json_schema",
        name: request.schemaName,
        schema: z.toJSONSchema(schema, { unrepresentable: "throw", target: "draft-7" }),
        strict: true,
      };
    } catch {
      throw configError(request.requestId);
    }
  }

  private async generate(
    request: ProviderTextRequest,
    format: ResponseFormat | undefined,
  ): Promise<ProviderTextResult> {
    try {
      const response = await fetch(this.operationUrl(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(this.requestBody(request, format)),
        redirect: "manual",
        signal: request.attempt.signal,
      });
      if (!response.ok) throw await responseError(response, request.requestId);
      return normalizeResponse(await parseBody(response, request.requestId), this.options.modelId, request.requestId);
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (request.attempt.signal.aborted) throw cancelledError(request.requestId);
      throw ambiguousUnavailableError(request.requestId);
    }
  }

  private operationUrl(): string {
    return `${this.options.baseUrl.replace(/\/+$/, "")}/responses`;
  }

  private requestBody(request: ProviderTextRequest, format: ResponseFormat | undefined): unknown {
    return {
      model: this.options.modelId,
      instructions: request.instructions,
      input: request.messages.map((message) => inputMessage(message, request.asset)),
      max_output_tokens: this.options.maxOutputTokens,
      store: false,
      // Explicit, because a gateway that defaults to the streaming dialect would answer with SSE
      // that this adapter does not read.
      stream: false,
      ...(format ? { text: { format } } : {}),
    };
  }
}

function configError(requestId: string): AIError {
  return new AIError({
    code: "AI_CONFIG_ERROR",
    safeMessage: "AI service configuration is invalid.",
    requestId,
    retryable: false,
  });
}

function cancelledError(requestId: string): AIError {
  return new AIError({
    code: "AI_CANCELLED",
    safeMessage: "AI request was cancelled.",
    requestId,
    retryable: false,
  });
}

function ambiguousUnavailableError(requestId: string): AIError {
  return new AIError({
    code: "AI_UNAVAILABLE",
    safeMessage: "AI provider is unavailable.",
    requestId,
    retryable: false,
    dispatchOutcome: "ambiguous",
  });
}

async function parseBody(response: Response, requestId: string): Promise<OpenAIResponse> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid response");
    return body as OpenAIResponse;
  } catch {
    throw invalidOutputError(requestId, null);
  }
}

function normalizeResponse(body: OpenAIResponse, configuredModel: string, requestId: string): ProviderTextResult {
  const providerRequestId = nonEmptyString(body.id);
  const content = assistantContent(body.output);
  if (content.some((item) => item.type === "refusal")) throw refusedError(requestId, providerRequestId);
  const text = content
    .filter((item): item is Extract<OpenAIOutputContent, { type: "output_text" }> => item.type === "output_text")
    .map((item) => typeof item.text === "string" ? item.text : "")
    .join("");

  if (body.status === "completed") {
    if (!text) throw invalidOutputError(requestId, providerRequestId);
    return textResult(text, "stop", body, configuredModel, providerRequestId);
  }
  if (body.status === "incomplete" && body.incomplete_details?.reason === "max_output_tokens") {
    if (!text) throw invalidOutputError(requestId, providerRequestId);
    return textResult(text, "length", body, configuredModel, providerRequestId);
  }
  if (body.status === "incomplete" || body.status === "failed" || body.status === "queued" || body.status === "in_progress") {
    throw unavailableError(requestId, providerRequestId);
  }
  if (body.status === "cancelled") throw cancelledResponseError(requestId, providerRequestId);
  throw invalidOutputError(requestId, providerRequestId);
}

function assistantContent(output: unknown): OpenAIOutputContent[] {
  if (!Array.isArray(output)) return [];
  const content: OpenAIOutputContent[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const message = item as { type?: unknown; role?: unknown; content?: unknown };
    if (message.type !== "message" || message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part && typeof part === "object" && !Array.isArray(part) && typeof (part as { type?: unknown }).type === "string") {
        content.push(part as OpenAIOutputContent);
      }
    }
  }
  return content;
}

function textResult(
  text: string,
  finishReason: "stop" | "length",
  body: OpenAIResponse,
  configuredModel: string,
  providerRequestId: string | null,
): ProviderTextResult {
  return {
    text,
    finishReason,
    providerRequestId,
    model: nonEmptyString(body.model) ?? configuredModel,
    usage: usage(body),
  };
}

function usage(body: OpenAIResponse): AIUsage {
  return {
    inputTokens: integerOrNull(body.usage?.input_tokens),
    outputTokens: integerOrNull(body.usage?.output_tokens),
    totalTokens: integerOrNull(body.usage?.total_tokens),
  };
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function refusedError(requestId: string, providerRequestId: string | null): AIError {
  return aiError("AI_REFUSED", "AI provider refused the request.", requestId, false, { providerRequestId });
}

function invalidOutputError(requestId: string, providerRequestId: string | null): AIError {
  return aiError("AI_INVALID_OUTPUT", "AI provider returned an invalid response.", requestId, false, { providerRequestId });
}

function unavailableError(requestId: string, providerRequestId: string | null): AIError {
  return aiError("AI_UNAVAILABLE", "AI provider could not complete the request.", requestId, false, { providerRequestId });
}

function cancelledResponseError(requestId: string, providerRequestId: string | null): AIError {
  return aiError("AI_CANCELLED", "AI request was cancelled.", requestId, false, { providerRequestId });
}

type AIErrorMetadata = {
  providerRequestId?: string | null;
  providerStatus?: number;
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
    ...(metadata.providerRequestId ? { providerRequestId: metadata.providerRequestId } : {}),
    ...(metadata.providerStatus === undefined ? {} : { providerStatus: metadata.providerStatus }),
    ...(metadata.retryAfterMs === undefined ? {} : { retryAfterMs: metadata.retryAfterMs }),
  });
}

async function responseError(response: Response, requestId: string): Promise<AIError> {
  const status = response.status;
  const errorBody = await parseErrorBody(response);
  const providerRequestId = response.headers.get("x-request-id") ?? errorRequestId(errorBody);
  const metadata = { providerStatus: status, providerRequestId };
  if (status === 400 || status === 422) {
    return aiError("AI_INPUT_INVALID", "AI provider rejected the request.", requestId, false, metadata);
  }
  if (status === 401 || status === 403) {
    return aiError("AI_AUTH_ERROR", "AI provider authentication failed.", requestId, false, metadata);
  }
  if (status === 429) {
    return aiError("AI_RATE_LIMITED", "AI provider rate limit reached.", requestId, true, {
      ...metadata,
      retryAfterMs: retryAfterMs(response.headers.get("retry-after")) ?? undefined,
    });
  }
  if (status >= 500 && status <= 599) {
    return aiError("AI_UNAVAILABLE", "AI provider is unavailable.", requestId, true, metadata);
  }
  return aiError("AI_UNAVAILABLE", "AI provider returned an unexpected response.", requestId, false, metadata);
}

async function parseErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorRequestId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const error = body as { request_id?: unknown; id?: unknown; error?: { request_id?: unknown; id?: unknown } };
  return nonEmptyString(error.request_id)
    ?? nonEmptyString(error.id)
    ?? nonEmptyString(error.error?.request_id)
    ?? nonEmptyString(error.error?.id);
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1_000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

function inputMessage(message: AIMessage, asset: ResolvedAIAsset | undefined): unknown {
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: message.content }];
  if (message.assetId && asset?.assetId === message.assetId) {
    content.push({
      type: "input_image",
      detail: "auto",
      image_url: `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}`,
    });
  }
  return { role: message.role, content };
}
