import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ProviderTextRequest } from "../../domain/ai-service/types";
import { OpenAIResponsesAdapter } from "./openai-responses-adapter";

const request: ProviderTextRequest = { requestId: "request", instructions: "Use submitted facts only.", messages: [{ role: "user", content: "Promo Kopi" }], attempt: { attemptId: "attempt", attemptNumber: 1, signal: new AbortController().signal } };

const options = { baseUrl: "http://127.0.0.1:20128/v1/", apiKey: "test-only-key", modelId: "router-model", maxOutputTokens: 1000 };

const structuredSchema = z.object({ headline: z.string() }).strict();

const responseBody = { id: "response-id", model: "actual-model", status: "completed", output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: '{"headline":"Kopi"}' }] }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };

afterEach(() => vi.restoreAllMocks());

describe("OpenAI Responses provider adapter", () => {
  it("sends genuine native structured output to the configured 9Router Responses endpoint", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(responseBody)));
    const adapter = new OpenAIResponsesAdapter({ ...options, schemas: { "campaign@1": structuredSchema } });
    const result = await adapter.generateStructured({ ...request, schemaName: "campaign", schemaVersion: "1" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:20128/v1/responses");
    expect(init?.headers).toMatchObject({ authorization: "Bearer test-only-key" });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "router-model", store: false, stream: false, text: { format: { type: "json_schema", name: "campaign", strict: true, schema: { type: "object", additionalProperties: false } } } });
    expect(result).toMatchObject({ json: '{"headline":"Kopi"}', providerRequestId: "response-id", model: "actual-model", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } });
  });

  it("embeds authorized image bytes only in the referenced user message", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(responseBody)));
    const adapter = new OpenAIResponsesAdapter(options);
    await adapter.generateText({ ...request, messages: [{ role: "user", content: "Brand", assetId: "asset" }], asset: { assetId: "asset", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" } });
    const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(body.input[0].content).toEqual([{ type: "input_text", text: "Brand" }, { type: "input_image", image_url: "data:image/png;base64,AQID" }]);
  });

  it("refuses output rather than accepting a refusal as creative copy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ...responseBody, output: [{ type: "message", content: [{ type: "refusal", refusal: "Not allowed" }] }] })));
    await expect(new OpenAIResponsesAdapter(options).generateText(request)).rejects.toMatchObject({ code: "AI_REFUSED", retryable: false });
  });

  it("marks a malformed successful response as invalid output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json"));
    await expect(new OpenAIResponsesAdapter(options).generateText(request)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("classifies rate limiting with safe retry metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("secret provider body", { status: 429, headers: { "retry-after": "2", "x-request-id": "provider-id" } }));
    await expect(new OpenAIResponsesAdapter(options).generateText(request)).rejects.toMatchObject({ code: "AI_RATE_LIMITED", retryable: true, retryAfterMs: 2000, dispatchOutcome: "rejected", providerRequestId: "provider-id" });
  });

  it("does not automatically retry ambiguous network dispatch", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection dropped"));
    await expect(new OpenAIResponsesAdapter(options).generateText(request)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: false, dispatchOutcome: "ambiguous" });
  });

  it("uses a length finish reason so truncated structured JSON cannot be accepted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ...responseBody, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })));
    expect((await new OpenAIResponsesAdapter(options).generateText(request)).finishReason).toBe("length");
  });
});
