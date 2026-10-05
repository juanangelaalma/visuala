import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AIError } from "../../domain/ai-service/errors";
import { OutputValidationError } from "../../domain/ai-service/output-validation-error";
import type { ProviderStructuredRequest, ProviderTextRequest } from "../../domain/ai-service/types";
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

describe("OpenAIResponsesAdapter structured streams", () => {
  it("publishes real HTTP deltas before completion and uses authoritative terminal output", async () => {
    const gate = deferred();
    const published = deferred();
    const deltas: string[] = [];
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      chunks: (async function* () {
        yield streamEvent("response.output_text.delta", { delta: '{"answer":"preview' });
        await gate.promise;
        yield streamEvent("response.completed", { response: structuredBody('{"answer":"final"}') });
      })(),
    }), "/v1/");
    let settled = false;
    const result = streamAdapter(server.baseUrl).generateStructured(streamRequest((delta) => {
      deltas.push(delta);
      published.release();
    }));
    void result.then(() => { settled = true; }, () => { settled = true; });
    try {
      await published.promise;
      expect(deltas).toEqual(['{"answer":"preview']);
      expect(settled).toBe(false);
      expect(server.requests[0]?.body).toMatchObject({
        stream: true, store: false, max_output_tokens: 321,
        text: { format: { type: "json_schema", name: "verdict", strict: true } },
      });
      gate.release();
      await expect(result).resolves.toMatchObject({
        json: '{"answer":"final"}', finishReason: "stop", providerRequestId: "resp_1",
        usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 },
      });
    } finally {
      gate.release();
    }
  });

  it("uses completed assistant items in output order when the completed response has empty output", async () => {
    const deltas: string[] = [];
    const first = { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"answer":' }] };
    const second = { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '"final"}' }] };
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.output_text.delta", { delta: '{"answer":"preview' })
        + streamEvent("response.output_item.done", { output_index: 0, item: { type: "reasoning", summary: [] } })
        + streamEvent("response.output_item.done", { output_index: 2, item: second })
        + streamEvent("response.output_item.done", { output_index: 1, item: first })
        + streamEvent("response.output_item.done", { output_index: 1, item: first })
        + streamEvent("response.completed", { response: { ...successBody, output: [] } }),
    }), "/v1/");

    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest((delta) => deltas.push(delta))))
      .resolves.toMatchObject({
        json: '{"answer":"final"}', finishReason: "stop", providerRequestId: "resp_1",
        usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 },
      });
    expect(deltas).toEqual(['{"answer":"preview']);
  });

  it("keeps nonempty terminal output authoritative over completed item output", async () => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.output_item.done", {
        output_index: 0,
        item: { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"answer":"item"}' }] },
      }) + streamEvent("response.completed", { response: structuredBody('{"answer":"terminal"}') }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .resolves.toMatchObject({ json: '{"answer":"terminal"}' });
  });

  it.each([
    ["preview deltas", streamEvent("response.output_text.delta", { delta: '{"answer":"preview"}' })],
    ["text completion without an item", streamEvent("response.output_text.done", { text: '{"answer":"text"}' })],
    ["unfinished message", streamEvent("response.output_item.done", {
      output_index: 0, item: { type: "message", role: "assistant", status: "in_progress", content: [{ type: "output_text", text: '{"answer":"unfinished"}' }] },
    })],
    ["invalid message content", streamEvent("response.output_item.done", {
      output_index: 0, item: { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: 42 }] },
    })],
  ])("does not accept %s as completed assistant output", async (_name, prefix) => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: prefix + streamEvent("response.completed", { response: { ...successBody, output: [] } }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toSatisfy((error: AIError | OutputValidationError) => (
        error instanceof OutputValidationError ? error.error.code === "AI_INVALID_OUTPUT" : error.code === "AI_INVALID_OUTPUT"
      ));
  });

  it.each([
    ["failed", "AI_UNAVAILABLE"],
    ["incomplete", "AI_UNAVAILABLE"],
    ["cancelled", "AI_CANCELLED"],
  ])("does not let completed items override a %s response", async (status, code) => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.output_item.done", {
        output_index: 0,
        item: { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"answer":"item"}' }] },
      }) + streamEvent(`response.${status}`, { response: { ...successBody, status, output: [] } }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toSatisfy((error: OutputValidationError) => error instanceof OutputValidationError && error.error.code === code);
  });

  it("rejects a completed refusal item even when the completed response has empty output", async () => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.output_item.done", {
        output_index: 0,
        item: { type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "secret" }] },
      }) + streamEvent("response.completed", { response: { ...successBody, output: [] } }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toSatisfy((error: OutputValidationError) => (
        error instanceof OutputValidationError && error.error.code === "AI_REFUSED" && !error.message.includes("secret")
      ));
  });

  it("requires a terminal response after a completed assistant item", async () => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.output_item.done", {
        output_index: 0,
        item: { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"answer":"item"}' }] },
      }) + "data: [DONE]\n\n",
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE", dispatchOutcome: "ambiguous" });
  });

  it("rejects reconstruction if another assistant item did not finish", async () => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.output_item.done", {
        output_index: 0,
        item: { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"answer":"item"}' }] },
      }) + streamEvent("response.output_item.done", {
        output_index: 1,
        item: { type: "message", role: "assistant", status: "incomplete", content: [{ type: "output_text", text: "unfinished" }] },
      }) + streamEvent("response.completed", { response: { ...successBody, output: [] } }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toSatisfy((error: OutputValidationError) => (
        error instanceof OutputValidationError && error.error.code === "AI_INVALID_OUTPUT"
        && error.provider.usage.totalTokens === 15
      ));
  });

  it("preserves terminal truncation and usage when an item finishes incomplete", async () => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.output_item.done", {
        output_index: 0,
        item: { type: "message", role: "assistant", status: "incomplete", content: [{ type: "output_text", text: '{"answer":"partial' }] },
      }) + streamEvent("response.incomplete", { response: {
        ...responseWithContent([{ type: "output_text", text: '{"answer":"partial' }]),
        status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
      } }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .resolves.toMatchObject({ json: '{"answer":"partial', finishReason: "length", usage: { totalTokens: 15 } });
  });

  it("decodes split UTF-8, CRLF, multiline data, comments and multiple records without forwarding progress", async () => {
    const text = ': heartbeat\r\n\r\n'
      + 'event: response.output_text.delta\r\n'
      + 'data: {"type":"response.output_text.delta",\r\n'
      + 'data: "delta":"café 🛍️"}\r\n\r\n'
      + streamEvent("response.reasoning_summary_text.delta", { delta: "private reasoning" })
      + streamEvent("response.output_text.delta", { delta: ' quote"\\\n' })
      + streamEvent("response.completed", { response: structuredBody('{"answer":"final"}') });
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, {
      headers: { "content-type": "text/event-stream" },
    }));
    const deltas: string[] = [];
    try {
      await expect(streamAdapter("https://example.com/v1/").generateStructured(streamRequest((delta) => deltas.push(delta))))
        .resolves.toMatchObject({ json: '{"answer":"final"}' });
      expect(deltas).toEqual(["café 🛍️", ' quote"\\\n']);
      expect(body.locked).toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    ["missing terminal", streamEvent("response.output_text.delta", { delta: "partial" }), "AI_UNAVAILABLE"],
    ["DONE only", "data: [DONE]\n\n", "AI_UNAVAILABLE"],
    ["unterminated terminal record", streamEvent("response.completed", { response: successBody }).trimEnd(), "AI_UNAVAILABLE"],
    ["malformed JSON", "data: secret not json\n\n", "AI_INVALID_OUTPUT"],
    ["malformed delta", streamEvent("response.output_text.delta", { delta: 7 }), "AI_INVALID_OUTPUT"],
    ["missing response", streamEvent("response.completed", {}), "AI_INVALID_OUTPUT"],
    ["primitive response", streamEvent("response.completed", { response: 42 }), "AI_INVALID_OUTPUT"],
    ["array response", streamEvent("response.completed", { response: [] }), "AI_INVALID_OUTPUT"],
    ["error", streamEvent("error", { message: "secret" }), "AI_UNAVAILABLE"],
    ["cancellation", streamEvent("response.cancelled", { message: "secret" }), "AI_CANCELLED"],
    ["refusal without terminal", streamEvent("response.refusal.delta", { delta: "secret" }), "AI_REFUSED"],
  ])("fails safely with ambiguous billing for %s", async (_name, rawBody, code) => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" }, rawBody,
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toSatisfy((error: AIError) => (
        error instanceof AIError && error.code === code && error.dispatchOutcome === "ambiguous"
        && !error.retryable && !error.message.includes("secret")
      ));
  });

  it("rejects buffered JSON instead of silently substituting buffered output", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toMatchObject({ code: "AI_INVALID_OUTPUT", dispatchOutcome: "ambiguous", retryable: false });
  });

  it("rejects a missing response body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, {
      headers: { "content-type": "text/event-stream" },
    }));
    try {
      await expect(streamAdapter("https://example.com/v1/").generateStructured(streamRequest(() => {})))
        .rejects.toMatchObject({ code: "AI_INVALID_OUTPUT", dispatchOutcome: "ambiguous" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("fails safely on malformed UTF-8 and releases the byte reader", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.of(0xc3, 0x28)); controller.close(); },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, {
      headers: { "content-type": "text/event-stream" },
    }));
    try {
      await expect(streamAdapter("https://example.com/v1/").generateStructured(streamRequest(() => {})))
        .rejects.toMatchObject({ code: "AI_INVALID_OUTPUT", dispatchOutcome: "ambiguous" });
      expect(body.locked).toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    ["empty terminal output", { ...successBody, output: [] }, "", "AI_INVALID_OUTPUT"],
    ["terminal refusal", responseWithContent([{ type: "refusal", refusal: "secret" }]), "", "AI_REFUSED"],
    ["refusal delta with terminal usage", structuredBody('{"answer":"final"}'), streamEvent("response.refusal.delta", { delta: "secret" }), "AI_REFUSED"],
    ["failed terminal", { ...successBody, status: "failed" }, "", "AI_UNAVAILABLE"],
    ["cancelled terminal with usage", { ...successBody, status: "cancelled" }, "", "AI_CANCELLED"],
    ["incomplete content filter", { ...successBody, status: "incomplete", incomplete_details: { reason: "content_filter" } }, "", "AI_UNAVAILABLE"],
    ["mismatched terminal status", { ...successBody, status: "in_progress" }, "", "AI_INVALID_OUTPUT"],
  ])("retains provider usage when %s cannot normalize", async (_name, body, prefix, code) => {
    const status = "status" in body ? body.status : undefined;
    const event = status === "failed" || status === "incomplete" || status === "cancelled" ? `response.${status}` : "response.completed";
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: prefix + streamEvent(event, { response: body }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toSatisfy((error: OutputValidationError) => (
        error instanceof OutputValidationError && error.error.code === code
        && error.provider.providerRequestId === "resp_1"
        && error.provider.model === "gpt-5.6-luna"
        && error.provider.usage.inputTokens === 11 && error.provider.usage.outputTokens === 4
        && !error.message.includes("secret")
      ));
  });

  it("returns terminal length and usage for max-output incomplete responses", async () => {
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      rawBody: streamEvent("response.incomplete", { response: {
        ...structuredBody('{"answer":"partial'),
        status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
      } }),
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {}))).resolves.toMatchObject({
      json: '{"answer":"partial', finishReason: "length", usage: { totalTokens: 15 },
    });
  });

  it.each(["terminal", "error", "abort", "content-type"] as const)("cancels and releases an open reader on %s", async (exit) => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const published = deferred();
    const data = streamEvent("response.output_text.delta", { delta: "preview" })
      + (exit === "terminal" ? streamEvent("response.completed", { response: structuredBody('{"answer":"final"}') })
        : exit === "error" ? streamEvent("error", { message: "secret" }) : "");
    const body = new ReadableStream<Uint8Array>({
      start(stream) { stream.enqueue(new TextEncoder().encode(data)); },
      cancel,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, {
      headers: { "content-type": exit === "content-type" ? "application/json" : "text/event-stream" },
    }));
    try {
      const result = streamAdapter("https://example.com/v1/").generateStructured(streamRequest(() => published.release(), {
        attempt: { attemptId: "attempt-1", attemptNumber: 1, signal: controller.signal },
      }));
      if (exit === "abort") {
        await published.promise;
        controller.abort();
      }
      if (exit === "terminal") await expect(result).resolves.toMatchObject({ json: '{"answer":"final"}' });
      else await expect(result).rejects.toMatchObject({
        code: exit === "abort" ? "AI_CANCELLED" : exit === "content-type" ? "AI_INVALID_OUTPUT" : "AI_UNAVAILABLE",
        dispatchOutcome: "ambiguous",
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(body.locked).toBe(false);
    } finally {
      controller.abort();
      fetchSpy.mockRestore();
    }
  });

  it("keeps HTTP rejection mapping and Retry-After for streaming requests", async () => {
    const server = await startHttpFixtureServer(() => ({
      status: 429, headers: { "retry-after": "7", "x-request-id": "req-limited" },
      body: { error: { message: "secret" } },
    }), "/v1/");
    await expect(streamAdapter(server.baseUrl).generateStructured(streamRequest(() => {})))
      .rejects.toMatchObject({
        code: "AI_RATE_LIMITED", retryable: true, retryAfterMs: 7_000, providerRequestId: "req-limited",
      });
  });

  it("preserves ambiguous dispatch after an actual HTTP disconnect following publication", async () => {
    const gate = deferred();
    const published = deferred();
    const server = await startHttpFixtureServer(() => ({
      headers: { "content-type": "text/event-stream" },
      chunks: (async function* () {
        yield streamEvent("response.output_text.delta", { delta: "preview" });
        await gate.promise;
        throw new Error("secret fixture disconnect");
      })(),
    }), "/v1/");
    const result = streamAdapter(server.baseUrl).generateStructured(streamRequest(() => published.release()));
    try {
      await published.promise;
      gate.release();
      await expect(result).rejects.toMatchObject({
        code: "AI_UNAVAILABLE", dispatchOutcome: "ambiguous", retryable: false,
      });
    } finally {
      gate.release();
    }
  });
});

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function streamEvent(type: string, fields: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
}

function structuredBody(text: string): object {
  return responseWithContent([{ type: "output_text", text }]);
}

function streamAdapter(baseUrl: string): OpenAIResponsesAdapter {
  return makeAdapter(baseUrl, { schemas: { "verdict@1": z.object({ answer: z.string() }) } });
}

function streamRequest(
  onTextDelta: (delta: string) => void,
  overrides: Partial<ProviderTextRequest> = {},
): ProviderStructuredRequest {
  return { ...makeRequest(overrides), schemaName: "verdict", schemaVersion: "1", onTextDelta };
}

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
