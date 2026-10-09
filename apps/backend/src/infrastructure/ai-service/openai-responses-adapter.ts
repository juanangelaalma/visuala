import { z, type ZodType } from "zod";
import type { JSONSchema } from "zod/v4/core";
import type { ProviderAdapter } from "../../domain/ai-service/contracts";
import { AIError, type AIErrorCode, type AIErrorInput } from "../../domain/ai-service/errors";
import type { AIMessage, ProviderStructuredRequest, ProviderStructuredResult, ProviderTextRequest, ProviderTextResult, ResolvedAIAsset } from "../../domain/ai-service/types";

export type OpenAIResponsesAdapterOptions = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  schemas?: Readonly<Record<string, ZodType>>;
};

const responseSchema = z.object({
  id: z.string().optional(), model: z.string().optional(), status: z.enum(["completed", "incomplete"]),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() }).passthrough()).optional() }).passthrough()).optional(),
  incomplete_details: z.object({ reason: z.string().optional() }).nullish(),
  usage: z.object({ input_tokens: z.number().int().nonnegative().optional(), output_tokens: z.number().int().nonnegative().optional(), total_tokens: z.number().int().nonnegative().optional() }).nullish(),
}).passthrough();

type OpenAIResponse = z.infer<typeof responseSchema>;

type ResponseFormat = { type: "json_schema"; name: string; strict: true; schema: JSONSchema.BaseSchema };

type ResponseMessage = { role: AIMessage["role"]; content: Array<{ type: string; text?: string; image_url?: string }> };

type ResponseBody = {
  model: string; instructions: string; input: ResponseMessage[];
  max_output_tokens: number; store: false; stream: false; text?: { format: ResponseFormat };
};

export class OpenAIResponsesAdapter implements ProviderAdapter {
  constructor(private readonly options: OpenAIResponsesAdapterOptions) {}

  async generateText(request: ProviderTextRequest): Promise<ProviderTextResult> {
    return this.generate(request);
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    const schema = this.options.schemas?.[`${request.schemaName}@${request.schemaVersion}`];

    if (!schema) throw providerError("AI_CONFIG_ERROR", "AI schema is not configured.", request.requestId);

    const format: ResponseFormat = { type: "json_schema", name: request.schemaName.replace(/[^a-zA-Z0-9_-]/g, "_"), strict: true,
      schema: z.toJSONSchema(schema, { unrepresentable: "throw", target: "draft-7" }) };

    const result = await this.generate(request, format);

    return { ...result, json: result.text };
  }

  private async generate(request: ProviderTextRequest, format?: ResponseFormat): Promise<ProviderTextResult> {
    try {
      const payload: ResponseBody = {
        model: this.options.modelId, instructions: request.instructions,
        input: request.messages.map((message) => responseMessage(message, request.asset)),
        max_output_tokens: this.options.maxOutputTokens, store: false, stream: false,
      };

      if (format) payload.text = { format };

      const response = await fetch(`${this.options.baseUrl.replace(/\/+$/, "")}/responses`, {
        method: "POST", redirect: "manual", signal: request.attempt.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw httpError(response, request.requestId);

      const raw = await response.json().catch(() => {
        throw providerError("AI_INVALID_OUTPUT", "AI provider returned an invalid response.", request.requestId);
      });

      const parsed = responseSchema.safeParse(raw);

      if (!parsed.success) throw providerError("AI_INVALID_OUTPUT", "AI provider returned an invalid response.", request.requestId);

      return normalizeResponse(parsed.data, this.options.modelId, request.requestId);
    } catch (error) {
      if (error instanceof AIError) throw error;

      if (request.attempt.signal.aborted) throw providerError("AI_CANCELLED", "AI request was cancelled.", request.requestId);
      throw new AIError({ code: "AI_UNAVAILABLE", safeMessage: "AI provider is unavailable.", requestId: request.requestId, retryable: false, dispatchOutcome: "ambiguous" });
    }
  }
}

function responseMessage(message: AIMessage, asset?: ResolvedAIAsset): ResponseMessage {
  const content: Array<{ type: string; text?: string; image_url?: string }> = [{ type: message.role === "assistant" ? "output_text" : "input_text", text: message.content }];

  if (message.assetId && asset?.assetId === message.assetId) content.push({ type: "input_image", image_url: `data:${asset.mimeType};base64,${Buffer.from(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.byteLength).toString("base64")}` });

  return { role: message.role, content };
}

function normalizeResponse(body: OpenAIResponse, requestedModel: string, requestId: string): ProviderTextResult {
  if (!body.output) throw providerError("AI_INVALID_OUTPUT", "AI provider returned an invalid response.", requestId);
  const parts: string[] = [];

  for (const output of body.output) {
    if (output.type !== "message" || !output.content) continue;

    for (const part of output.content) {
      if (part.type === "refusal") throw providerError("AI_REFUSED", "AI provider refused the request.", requestId);

      if (part.type === "output_text" && part.text) parts.push(part.text);
    }
  }

  const text = parts.join("");

  if (!text) throw providerError("AI_INVALID_OUTPUT", "AI provider returned an invalid response.", requestId);

  return { text, model: body.model ?? requestedModel, providerRequestId: body.id ?? null,
    finishReason: body.status === "completed" ? "stop" : body.incomplete_details?.reason === "max_output_tokens" ? "length" : "unknown",
    usage: { inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null, totalTokens: body.usage?.total_tokens ?? null } };
}

function httpError(response: Response, requestId: string): AIError {
  const status = response.status;
  const code: AIErrorCode = status === 401 || status === 403 ? "AI_AUTH_ERROR" : status === 429 ? "AI_RATE_LIMITED" : status === 400 || status === 422 ? "AI_INPUT_INVALID" : "AI_UNAVAILABLE";
  const messages: Partial<Record<AIErrorCode, string>> = { AI_AUTH_ERROR: "AI provider authentication failed.", AI_RATE_LIMITED: "AI provider rate limit reached.", AI_INPUT_INVALID: "AI provider rejected the request." };
  const retry = response.headers.get("retry-after");
  const retryAfterMs = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Math.max(0, Date.parse(retry) - Date.now()) : undefined;

  const input: AIErrorInput = { code, safeMessage: messages[code] ?? "AI provider is unavailable.", requestId,
    retryable: status === 429 || status >= 500, dispatchOutcome: "rejected", providerStatus: status };

  const providerRequestId = response.headers.get("x-request-id");

  if (providerRequestId) input.providerRequestId = providerRequestId;

  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs)) input.retryAfterMs = retryAfterMs;

  return new AIError(input);
}

function providerError(code: AIErrorCode, safeMessage: string, requestId: string): AIError {
  return new AIError({ code, safeMessage, requestId, retryable: false });
}
