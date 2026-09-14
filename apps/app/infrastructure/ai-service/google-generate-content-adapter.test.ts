import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AIError } from "../../domain/ai-service/errors";
import type { ProviderTextRequest } from "../../domain/ai-service/types";
import {
  GoogleGenerateContentAdapter,
  type GoogleGenerateContentAdapterOptions,
} from "./google-generate-content-adapter";
import { startHttpFixtureServer } from "./http-fixture-server.test";

const successBody = {
  candidates: [{ content: { role: "model", parts: [{ text: "Hello" }] }, finishReason: "STOP", index: 0 }],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4, totalTokenCount: 15 },
  modelVersion: "gemini-test",
  responseId: "response-1",
};

describe("GoogleGenerateContentAdapter requests", () => {
  it("sends the documented path, key header, roles, ordered parts, image, and output limit", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = makeAdapter(server.baseUrl, { modelId: "models/gemini/test model", apiKey: "key-a" });

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
        url: "/v1beta/models/gemini/test%20model:generateContent",
        headers: { "x-goog-api-key": "key-a", "content-type": "application/json" },
        body: {
          systemInstruction: { parts: [{ text: "System A" }] },
          contents: [
            { role: "user", parts: [{ text: "See image" }, { inlineData: { mimeType: "image/png", data: "AQID" } }] },
            { role: "model", parts: [{ text: "I see it" }] },
            { role: "user", parts: [{ text: "Describe it" }] },
          ],
          generationConfig: { maxOutputTokens: 321 },
        },
      });
      expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual", signal: expect.any(AbortSignal) });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    ["gemini-test", "/v1beta/models/gemini-test:generateContent"],
    ["models/gemini-test", "/v1beta/models/gemini-test:generateContent"],
    ["publishers/google/models/gemini-test", "/v1beta/publishers/google/models/gemini-test:generateContent"],
  ])("uses documented resource path semantics for %s", async (modelId, path) => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }));

    await makeAdapter(server.baseUrl, { modelId }).generateText(makeRequest());

    expect(server.requests[0]?.url).toBe(path);
  });

  it.each(["../gemini", "models/../gemini", "models/gemini?key=stolen", "models/gemini#fragment", "/models/gemini", "models//gemini"])(
    "rejects unsafe model resource %s before fetch",
    async (modelId) => {
      const server = await startHttpFixtureServer(() => ({ body: successBody }));

      const result = makeAdapter(server.baseUrl, { modelId }).generateText(makeRequest());

      await expect(result).rejects.toMatchObject({ code: "AI_CONFIG_ERROR" });
      expect(server.requests).toHaveLength(0);
    },
  );

  it("does not duplicate the API version in the operation path", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }), "/gateway/v1beta/");
    const adapter = makeAdapter(server.baseUrl);

    await adapter.generateText(makeRequest());

    expect(server.requests[0]?.url).toBe("/gateway/v1beta/models/gemini-test:generateContent");
  });

  it("sends native JSON schema configuration", async () => {
    const server = await startHttpFixtureServer(() => ({ body: { ...successBody, candidates: [{ content: { parts: [{ text: '{"answer":"yes"}' }] }, finishReason: "STOP" }] } }));
    const adapter = makeAdapter(server.baseUrl, {
      schemas: { "verdict@1": z.object({ answer: z.enum(["yes", "no"]), score: z.number().min(0).max(1) }) },
    });

    const result = await adapter.generateStructured({ ...makeRequest(), schemaName: "verdict", schemaVersion: "1" });

    expect(server.requests[0]?.body).toMatchObject({ generationConfig: {
      maxOutputTokens: 321,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: { answer: { type: "string", enum: ["yes", "no"] }, score: { type: "number", minimum: 0, maximum: 1 } },
        required: ["answer", "score"],
        additionalProperties: false,
      },
    } });
    expect(result.json).toBe('{"answer":"yes"}');
  });

  it("rejects unsupported Zod constructs before fetch", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }));
    const adapter = makeAdapter(server.baseUrl, { schemas: { "transformed@1": z.string().transform((value) => value.length) } });

    const result = adapter.generateStructured({ ...makeRequest(), schemaName: "transformed", schemaVersion: "1" });

    await expect(result).rejects.toMatchObject({ code: "AI_CONFIG_ERROR", retryable: false });
    expect(server.requests).toHaveLength(0);
  });

  it("requires both schema name and version to match", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }));
    const adapter = makeAdapter(server.baseUrl, { schemas: { "verdict@2": z.object({ answer: z.string() }) } });

    const result = adapter.generateStructured({ ...makeRequest(), schemaName: "verdict", schemaVersion: "1" });

    await expect(result).rejects.toMatchObject({ code: "AI_CONFIG_ERROR" });
    expect(server.requests).toHaveLength(0);
  });

  it("routes two profiles without leaking credentials, models, or instructions", async () => {
    const serverA = await startHttpFixtureServer(() => ({ body: successBody }));
    const serverB = await startHttpFixtureServer(() => ({ body: successBody }));
    const adapterA = makeAdapter(serverA.baseUrl, { apiKey: "key-a", modelId: "model-a" });
    const adapterB = makeAdapter(serverB.baseUrl, { apiKey: "key-b", modelId: "model-b" });

    await adapterA.generateText(makeRequest({ instructions: "System A" }));
    await adapterB.generateText(makeRequest({ instructions: "System B" }));

    expect([
      [serverA.requests[0]?.url, serverA.requests[0]?.headers["x-goog-api-key"], serverA.requests[0]?.body],
      [serverB.requests[0]?.url, serverB.requests[0]?.headers["x-goog-api-key"], serverB.requests[0]?.body],
    ]).toEqual([
      ["/v1beta/models/model-a:generateContent", "key-a", expect.objectContaining({ systemInstruction: { parts: [{ text: "System A" }] } })],
      ["/v1beta/models/model-b:generateContent", "key-b", expect.objectContaining({ systemInstruction: { parts: [{ text: "System B" }] } })],
    ]);
  });

  it("forwards abort through the attempt signal", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody, delayMs: 5_000 }));
    const controller = new AbortController();
    const adapter = makeAdapter(server.baseUrl);

    const result = adapter.generateText(makeRequest({ attempt: { attemptId: "attempt-1", attemptNumber: 1, signal: controller.signal } }));
    await waitForRequest(server.requests);
    controller.abort();

    await expect(result).rejects.toMatchObject({ code: "AI_CANCELLED", retryable: false });
  });
});

describe("GoogleGenerateContentAdapter responses", () => {
  it("normalizes text, finish reason, request ID, model, and usage", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }));

    const result = await makeAdapter(server.baseUrl).generateText(makeRequest());

    expect(result).toEqual({
      text: "Hello",
      finishReason: "stop",
      providerRequestId: "response-1",
      model: "gemini-test",
      usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 },
    });
  });

  it("normalizes omitted usage as null values", async () => {
    const server = await startHttpFixtureServer(() => ({ body: { ...successBody, usageMetadata: undefined } }));

    const result = await makeAdapter(server.baseUrl).generateText(makeRequest());

    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null, totalTokens: null });
  });

  it("normalizes max-token completion as truncation", async () => {
    const server = await startHttpFixtureServer(() => ({ body: { ...successBody, candidates: [{ content: { parts: [{ text: "partial" }] }, finishReason: "MAX_TOKENS" }] } }));

    const result = await makeAdapter(server.baseUrl).generateText(makeRequest());

    expect(result).toMatchObject({ text: "partial", finishReason: "length" });
  });

  it.each(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "ESCALATION", "PUP_LIMITED_DISABLED"])(
    "maps %s candidate completion to a refusal",
    async (finishReason) => {
      const server = await startHttpFixtureServer(() => ({ body: { ...successBody, candidates: [{ finishReason }] } }));

      const result = makeAdapter(server.baseUrl).generateText(makeRequest());

      await expect(result).rejects.toMatchObject({ code: "AI_REFUSED", providerRequestId: "response-1", retryable: false });
    },
  );

  it.each(["IMAGE_RECITATION"])("maps %s completion to a refusal", async (finishReason) => {
    const server = await startHttpFixtureServer(() => ({ body: candidateBody(finishReason) }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toMatchObject({ code: "AI_REFUSED" });
  });

  it.each(["MALFORMED_FUNCTION_CALL", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS", "MISSING_THOUGHT_SIGNATURE", "MALFORMED_RESPONSE", "NO_IMAGE"])(
    "maps %s completion to invalid output",
    async (finishReason) => {
      const server = await startHttpFixtureServer(() => ({ body: candidateBody(finishReason) }));

      const result = makeAdapter(server.baseUrl).generateText(makeRequest());

      await expect(result).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT", retryable: false });
    },
  );

  it.each(["LANGUAGE", "OTHER", "IMAGE_OTHER", "FINISH_REASON_UNSPECIFIED"])(
    "maps %s completion to unavailable",
    async (finishReason) => {
      const server = await startHttpFixtureServer(() => ({ body: candidateBody(finishReason) }));

      const result = makeAdapter(server.baseUrl).generateText(makeRequest());

      await expect(result).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: false });
    },
  );

  it("maps blocked prompt feedback to a refusal", async () => {
    const server = await startHttpFixtureServer(() => ({ body: { responseId: "blocked-1", promptFeedback: { blockReason: "SAFETY" } } }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toMatchObject({ code: "AI_REFUSED", providerRequestId: "blocked-1" });
  });

  it("rejects an empty candidate", async () => {
    const server = await startHttpFixtureServer(() => ({ body: { ...successBody, candidates: [{ content: { parts: [] }, finishReason: "STOP" }] } }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT", retryable: false });
  });

  it("rejects malformed JSON response bodies without exposing them", async () => {
    const server = await startHttpFixtureServer(() => ({ rawBody: "secret malformed body" }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toSatisfy((error: AIError) => error.code === "AI_INVALID_OUTPUT" && !error.message.includes("secret"));
  });

  it("uses the response ID as the request ID when an HTTP header is absent", async () => {
    const server = await startHttpFixtureServer(() => ({ status: 429, body: { responseId: "error-response-1", error: { message: "limited" } } }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toMatchObject({ code: "AI_RATE_LIMITED", providerRequestId: "error-response-1" });
  });
});

describe("GoogleGenerateContentAdapter failures", () => {
  it("marks a generic fetch failure as ambiguous", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("network failed"));

    try {
      const result = makeAdapter("https://example.com/v1beta/").generateText(makeRequest());

      await expect(result).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: false, dispatchOutcome: "ambiguous" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    [400, "AI_INPUT_INVALID", false],
    [401, "AI_AUTH_ERROR", false],
    [403, "AI_AUTH_ERROR", false],
    [429, "AI_RATE_LIMITED", true],
    [500, "AI_UNAVAILABLE", true],
    [502, "AI_UNAVAILABLE", true],
    [503, "AI_UNAVAILABLE", true],
    [504, "AI_UNAVAILABLE", true],
  ])("maps HTTP %s to %s", async (status, code, retryable) => {
    const server = await startHttpFixtureServer(() => ({ status, body: { error: { message: "secret provider detail" } } }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toSatisfy((error: AIError) => (
      error.code === code && error.retryable === retryable && error.providerStatus === status && !error.message.includes("secret")
    ));
  });

  it.each([301, 302, 307, 308])("rejects HTTP %s without following the redirect", async (status) => {
    const redirectTarget = await startHttpFixtureServer(() => ({ body: successBody }));
    const server = await startHttpFixtureServer(() => ({ status, headers: { location: `${redirectTarget.baseUrl}stolen` } }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toMatchObject({ code: "AI_UNAVAILABLE", providerStatus: status, retryable: false });
    expect(redirectTarget.requests).toHaveLength(0);
  });

  it("parses Retry-After seconds", async () => {
    const server = await startHttpFixtureServer(() => ({ status: 429, headers: { "retry-after": "7" }, body: {} }));

    const result = makeAdapter(server.baseUrl).generateText(makeRequest());

    await expect(result).rejects.toMatchObject({ code: "AI_RATE_LIMITED", retryAfterMs: 7_000 });
  });

  it("parses Retry-After HTTP dates against the controlled clock", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
      const server = await startHttpFixtureServer(() => ({ status: 429, headers: { "retry-after": "Sun, 13 Sep 2026 12:00:10 GMT" }, body: {} }));

      const result = makeAdapter(server.baseUrl).generateText(makeRequest());

      await expect(result).rejects.toMatchObject({ code: "AI_RATE_LIMITED", retryAfterMs: 10_000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the fetch spy when a request assertion throws", async () => {
    const server = await startHttpFixtureServer(() => ({ body: successBody }));
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      await makeAdapter(server.baseUrl).generateText(makeRequest());
      expect(fetchSpy).toHaveBeenCalledOnce();
    } finally {
      fetchSpy.mockRestore();
    }

    expect(globalThis.fetch).toBe(originalFetch);
  });
});

function makeAdapter(
  baseUrl: string,
  overrides: Partial<GoogleGenerateContentAdapterOptions> = {},
): GoogleGenerateContentAdapter {
  return new GoogleGenerateContentAdapter({
    baseUrl,
    apiKey: "key-test",
    modelId: "gemini-test",
    maxOutputTokens: 321,
    schemas: {},
    ...overrides,
  });
}

function candidateBody(finishReason: string): unknown {
  return { ...successBody, candidates: [{ content: { parts: [{ text: "partial" }] }, finishReason }] };
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

async function waitForRequest(requests: unknown[]): Promise<void> {
  for (let attempt = 0; attempt < 100 && requests.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
