import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AIError } from "../../domain/ai-service/errors";
import type { ProviderTextRequest } from "../../domain/ai-service/types";
import {
  OpenAIResponsesAdapter,
  type OpenAIResponsesAdapterOptions,
} from "./openai-responses-adapter";
import { startHttpFixtureServer } from "./http-fixture-server.test";

const successBody = {
  id: "resp_1",
  object: "response",
  created_at: 1_790_083_982,
  status: "completed",
  model: "gpt-5.6-luna",
  output: [{
    id: "msg_1",
    type: "message",
    status: "completed",
    role: "assistant",
    phase: "final_answer",
    content: [{ type: "output_text", annotations: [], logprobs: [], text: "Hello" }],
  }],
  usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15 },
};

describe("OpenAIResponsesAdapter requests", () => {
  it("sends the Responses path, bearer token, ordered messages, image, and output limit", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }), "/v1/");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = makeAdapter(server.baseUrl, { modelId: "cx/gpt-5.6-luna", apiKey: "key-a" });

    try {
      await adapter.generateText(makeRequest({
        messages: [
          { role: "user", content: "See image", assetId: "asset-1" },
          { role: "assistant", content: "I see it" },
          { role: "user", content: "Describe it" },
        ],
        asset: { assetId: "asset-1", bytes: Uint8Array.of(1, 2, 3), mimeType: "image/png" },
      }));

      expect(server.requests[0]).toMatchObject({
        method: "POST",
        url: "/v1/responses",
        headers: { authorization: "Bearer key-a", "content-type": "application/json" },
        body: {
          model: "cx/gpt-5.6-luna",
          instructions: "System A",
          input: [
            { role: "user", content: [
              { type: "input_text", text: "See image" },
              { type: "input_image", detail: "auto", image_url: "data:image/png;base64,AQID" },
            ] },
            { role: "assistant", content: [{ type: "output_text", text: "I see it" }] },
            { role: "user", content: [{ type: "input_text", text: "Describe it" }] },
          ],
          max_output_tokens: 321,
          store: false,
        },
      });
      expect(server.requests[0]?.body).toHaveProperty("stream", false);
      expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual", signal: expect.any(AbortSignal) });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("sends strict native JSON schema configuration", async () => {
    const server = await startHttpFixtureServer(() => ({
      body: {
        ...successBody,
        output: [{
          type: "message", status: "completed", role: "assistant",
          content: [{ type: "output_text", text: "{\"answer\":\"yes\",\"score\":1}" }],
        }],
      },
    }), "/v1/");
    const adapter = makeAdapter(server.baseUrl, {
      schemas: { "verdict@1": z.object({ answer: z.enum(["yes", "no"]), score: z.number().min(0).max(1) }) },
    });

    const result = await adapter.generateStructured({ ...makeRequest(), schemaName: "verdict", schemaVersion: "1" });

    expect(server.requests[0]?.body).toMatchObject({
      text: { format: {
        type: "json_schema",
        name: "verdict",
        strict: true,
        schema: {
          type: "object",
          properties: {
            answer: { type: "string", enum: ["yes", "no"] },
            score: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["answer", "score"],
          additionalProperties: false,
        },
      } },
    });
    expect(result.json).toBe('{"answer":"yes","score":1}');
  });

  it("requires the registered schema before fetch", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }), "/v1/");
    const result = makeAdapter(server.baseUrl).generateStructured({
      ...makeRequest(), schemaName: "missing", schemaVersion: "1",
    });

    await expect(result).rejects.toMatchObject({ code: "AI_CONFIG_ERROR" });
    expect(server.requests).toHaveLength(0);
  });

  it("rejects an unrepresentable registered schema before fetch", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }), "/v1/");
    const result = makeAdapter(server.baseUrl, {
      schemas: { "transformed@1": z.string().transform((value) => value) },
    }).generateStructured({
      ...makeRequest(), schemaName: "transformed", schemaVersion: "1",
    });

    await expect(result).rejects.toMatchObject({ code: "AI_CONFIG_ERROR" });
    expect(server.requests).toHaveLength(0);
  });

  it("removes trailing slashes before appending the Responses path", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }), "/v1///");

    await makeAdapter(server.baseUrl).generateText(makeRequest());

    expect(server.requests[0]?.url).toBe("/v1/responses");
  });

  it("keeps credentials, models, and instructions isolated between adapters", async () => {
    const firstServer = await startHttpFixtureServer(() => ({ body: successBody }), "/v1/");
    const secondServer = await startHttpFixtureServer(() => ({ body: successBody }), "/v1/");

    await Promise.all([
      makeAdapter(firstServer.baseUrl, { apiKey: "key-first", modelId: "model-first" }).generateText(makeRequest({ instructions: "First" })),
      makeAdapter(secondServer.baseUrl, { apiKey: "key-second", modelId: "model-second" }).generateText(makeRequest({ instructions: "Second" })),
    ]);

    expect(firstServer.requests[0]).toMatchObject({
      headers: { authorization: "Bearer key-first" },
      body: { model: "model-first", instructions: "First" },
    });
    expect(secondServer.requests[0]).toMatchObject({
      headers: { authorization: "Bearer key-second" },
      body: { model: "model-second", instructions: "Second" },
    });
  });

  it("maps an aborted attempt to cancellation", async () => {
    let requestReceived: (() => void) | undefined;
    const received = new Promise<void>((resolve) => { requestReceived = resolve; });
    const server = await startHttpFixtureServer(() => {
      requestReceived?.();
      return { body: successBody, delayMs: 100 };
    }, "/v1/");
    const controller = new AbortController();
    const result = makeAdapter(server.baseUrl).generateText(makeRequest({
      attempt: { attemptId: "attempt-1", attemptNumber: 1, signal: controller.signal },
    }));

    await received;
    controller.abort();

    await expect(result).rejects.toMatchObject({ code: "AI_CANCELLED" });
  });
});

describe("OpenAIResponsesAdapter responses", () => {
  it("normalizes a completed 9Router response", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).resolves.toEqual({
      text: "Hello",
      finishReason: "stop",
      providerRequestId: "resp_1",
      model: "gpt-5.6-luna",
      usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 },
    });
  });

  it("concatenates final output text and uses null for omitted usage", async () => {
    const server = await startHttpFixtureServer(() => ({ body: {
      ...successBody,
      model: undefined,
      usage: undefined,
      output: [{ type: "message", status: "completed", role: "assistant", phase: "final_answer", content: [
        { type: "output_text", text: "Hello " },
        { type: "output_text", text: "world" },
      ] }],
    } }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).resolves.toMatchObject({
      text: "Hello world",
      model: "cx/gpt-5.6-luna",
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    });
  });

  it("maps refusal content to AI_REFUSED without exposing provider text", async () => {
    const server = await startHttpFixtureServer(() => ({ body: responseWithContent([
      { type: "refusal", refusal: "sensitive provider detail" },
    ]) }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toSatisfy((error: AIError) => (
      error.code === "AI_REFUSED" && error.providerRequestId === "resp_1" && !error.retryable
      && !error.message.includes("sensitive")
    ));
  });

  it("maps max-output incomplete response to length", async () => {
    const server = await startHttpFixtureServer(() => ({ body: {
      ...responseWithContent([{ type: "output_text", text: "partial" }]),
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", status: "incomplete", role: "assistant", content: [
        { type: "output_text", text: "partial" },
      ] }],
    } }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).resolves.toMatchObject({
      text: "partial", finishReason: "length",
    });
  });

  it.each([
    ["incomplete", "AI_UNAVAILABLE", "content_filter"],
    ["failed", "AI_UNAVAILABLE"],
    ["cancelled", "AI_CANCELLED"],
    ["queued", "AI_UNAVAILABLE"],
    ["in_progress", "AI_UNAVAILABLE"],
    ["unexpected", "AI_INVALID_OUTPUT"],
  ])("maps %s terminal status safely", async (status, code, incompleteReason?: string) => {
    const server = await startHttpFixtureServer(() => ({ body: {
      ...responseWithContent([{ type: "output_text", text: "partial" }]),
      status,
      ...(incompleteReason ? { incomplete_details: { reason: incompleteReason } } : {}),
    } }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toMatchObject({
      code, providerRequestId: "resp_1", retryable: false,
    });
  });

  it.each([
    ["malformed JSON", { rawBody: "secret malformed body" }],
    ["top-level JSON array", { body: [] }],
    ["top-level JSON null", { rawBody: "null" }],
    ["top-level JSON primitive", { rawBody: "42" }],
    ["empty output", { body: { ...successBody, output: [] } }],
    ["malformed content", { body: { ...successBody, output: [{ type: "message", role: "assistant", content: "not an array" }] } }],
    ["tool-only output", { body: { ...successBody, output: [{ type: "function_call", arguments: "{}" }] } }],
  ])("rejects %s as invalid output without exposing provider text", async (_scenario, fixture) => {
    const server = await startHttpFixtureServer(() => fixture, "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toSatisfy((error: AIError) => (
      error.code === "AI_INVALID_OUTPUT" && !error.message.includes("secret")
    ));
  });
});

describe("OpenAIResponsesAdapter failures", () => {
  it.each([
    [400, "AI_INPUT_INVALID", false],
    [401, "AI_AUTH_ERROR", false],
    [403, "AI_AUTH_ERROR", false],
    [422, "AI_INPUT_INVALID", false],
    [429, "AI_RATE_LIMITED", true],
    [500, "AI_UNAVAILABLE", true],
    [502, "AI_UNAVAILABLE", true],
    [503, "AI_UNAVAILABLE", true],
    [504, "AI_UNAVAILABLE", true],
  ])("maps HTTP %s to %s", async (status, code, retryable) => {
    const server = await startHttpFixtureServer(() => ({
      status,
      body: { error: { message: "secret provider detail", request_id: "req_error_1" } },
    }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toSatisfy((error: AIError) => (
      error.code === code
      && error.retryable === retryable
      && error.providerStatus === status
      && error.providerRequestId === "req_error_1"
      && !error.message.includes("secret")
    ));
  });

  it.each([301, 302, 307, 308])("rejects HTTP redirect %s without following the target", async (status) => {
    const target = await startHttpFixtureServer(() => ({ body: successBody }), "/target/");
    const server = await startHttpFixtureServer(() => ({
      status,
      headers: { location: `${target.baseUrl}stolen` },
    }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toMatchObject({
      code: "AI_UNAVAILABLE", providerStatus: status, retryable: false,
    });
    expect(target.requests).toHaveLength(0);
  });

  it("parses Retry-After seconds", async () => {
    const server = await startHttpFixtureServer(() => ({
      status: 429,
      headers: { "retry-after": "7" },
      body: {},
    }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toMatchObject({
      code: "AI_RATE_LIMITED", retryAfterMs: 7_000,
    });
  });

  it("parses Retry-After HTTP dates", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
      const server = await startHttpFixtureServer(() => ({
        status: 429,
        headers: { "retry-after": "Sun, 13 Sep 2026 12:00:10 GMT" },
        body: {},
      }), "/v1/");

      await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toMatchObject({
        code: "AI_RATE_LIMITED", retryAfterMs: 10_000,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefers x-request-id over error body metadata", async () => {
    const server = await startHttpFixtureServer(() => ({
      status: 500,
      headers: { "x-request-id": "header-request-id" },
      body: { request_id: "body-request-id", error: { id: "nested-request-id" } },
    }), "/v1/");

    await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toMatchObject({
      providerRequestId: "header-request-id",
    });
  });

  it("maps a network failure to an ambiguous unavailable error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("network failure"));
    try {
      await expect(makeAdapter("https://example.com/v1/").generateText(makeRequest())).rejects.toMatchObject({
        code: "AI_UNAVAILABLE", retryable: false, dispatchOutcome: "ambiguous",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

function makeAdapter(
  baseUrl: string,
  overrides: Partial<OpenAIResponsesAdapterOptions> = {},
): OpenAIResponsesAdapter {
  return new OpenAIResponsesAdapter({
    baseUrl,
    apiKey: "key-test",
    modelId: "cx/gpt-5.6-luna",
    maxOutputTokens: 321,
    schemas: {},
    ...overrides,
  });
}

function responseWithContent(content: unknown[]): object {
  return {
    ...successBody,
    output: [{ type: "message", status: "completed", role: "assistant", content }],
  };
}

function makeRequest(overrides: Partial<ProviderTextRequest> = {}): ProviderTextRequest {
  return {
    requestId: "request-1",
    instructions: "System A",
    messages: [{ role: "user", content: "Hello" }],
    attempt: { attemptId: "attempt-1", attemptNumber: 1, signal: new AbortController().signal },
    ...overrides,
  };
}
