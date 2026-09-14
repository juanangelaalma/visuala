import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { ResolvedAIConfig } from "../../domain/ai-service/config";
import type {
  AIMessage,
  GenerateStructuredRequest,
  GenerateTextRequest,
} from "../../domain/ai-service/types";
import {
  validateStructuredRequest,
  validateTextRequest,
} from "./validate-request";

const config: ResolvedAIConfig = {
  profileId: "primary",
  apiFormat: "gemini-generate-content",
  baseUrl: "https://provider.example.com/v1/",
  apiKey: "secret",
  modelId: "model-a",
  provider: "provider",
  capabilities: {
    text: true,
    vision: true,
    nativeStructuredOutput: true,
  },
  limits: {
    maxInputCharacters: 100,
    maxOutputTokens: 32,
    maxImages: 1,
    maxImageBytes: 1_000,
    maxImageWidth: 1_024,
    maxImageHeight: 1_024,
    maxConcurrency: 2,
    attemptTimeoutMs: 30_000,
    totalDeadlineMs: 65_000,
    maxAttempts: 2,
  },
};

describe("validateTextRequest", () => {
  it.each([
    ["empty instructions", { instructions: "" }],
    ["whitespace-only instructions", { instructions: "  \n" }],
    ["empty messages", { messages: [] }],
    ["whitespace-only message content", { messages: [user(" \t")] }],
    ["missing user ID", { context: { userId: "" } }],
    ["missing request ID", { requestId: "" }],
    ["missing prompt version", { promptVersion: "" }],
  ])("rejects %s", (_caseName, overrides) => {
    expectInputError(() => validateTextRequest(makeRequest(overrides), config));
  });

  it("rejects an unsupported role received at runtime", () => {
    const messages = [
      { role: "system", content: "Do this" },
    ] as unknown as AIMessage[];

    expectInputError(() => validateTextRequest(makeRequest({ messages }), config));
  });

  it("rejects input text above the effective task limit", () => {
    const limitedConfig = makeConfig({ maxInputCharacters: 10 });

    expectInputError(() =>
      validateTextRequest(
        makeRequest({ instructions: "12345", messages: [user("123456")] }),
        limitedConfig,
      ),
    );
  });

  it("rejects a requested output above the effective task limit", () => {
    const limitedConfig = makeConfig({ maxOutputTokens: 0 });

    expectInputError(() => validateTextRequest(makeRequest(), limitedConfig));
  });

  it("rejects two unique image references", () => {
    expectInputError(() =>
      validateTextRequest(
        makeRequest({
          messages: [
            user("first", "asset-1"),
            user("second", "asset-2"),
          ],
        }),
        config,
      ),
    );
  });

  it("rejects an image reference in an assistant message", () => {
    expectInputError(() =>
      validateTextRequest(
        makeRequest({ messages: [assistant("result", "asset-1")] }),
        config,
      ),
    );
  });

  it("rejects text generation when unsupported", () => {
    expectCapabilityError(() =>
      validateTextRequest(
        makeRequest(),
        { ...config, capabilities: { ...config.capabilities, text: false } },
      ),
    );
  });

  it("rejects vision before an adapter call when unsupported", () => {
    expectCapabilityError(() =>
      validateTextRequest(
        makeRequest({ messages: [user("look", "asset-1")] }),
        { ...config, capabilities: { ...config.capabilities, vision: false } },
      ),
    );
  });

  it("clones ordered history", () => {
    const messages = [user("first"), assistant("second")];
    const value = validateTextRequest(makeRequest({ messages }), config);

    messages[0].content = "changed";
    messages.reverse();

    expect(value.messages.map((message) => message.content)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("validateStructuredRequest", () => {
  it("rejects structured generation when native output is unsupported", () => {
    expectCapabilityError(() =>
      validateStructuredRequest(
        makeStructuredRequest(),
        {
          ...config,
          capabilities: {
            ...config.capabilities,
            nativeStructuredOutput: false,
          },
        },
      ),
    );
  });

  it("returns a cloned structured request", () => {
    const messages = [user("first")];
    const request = makeStructuredRequest({ messages });
    const value = validateStructuredRequest(request, config);

    messages[0].content = "changed";

    expect(value).not.toBe(request);
    expect(value.messages[0].content).toBe("first");
  });
});

function makeRequest(
  overrides: Partial<GenerateTextRequest> = {},
): GenerateTextRequest {
  return {
    requestId: "request-1",
    task: "planner",
    context: { userId: "user-1" },
    instructions: "Answer clearly",
    messages: [user("Hello")],
    promptVersion: "v1",
    ...overrides,
  };
}

function makeStructuredRequest(
  overrides: Partial<GenerateStructuredRequest<{ answer: string }>> = {},
): GenerateStructuredRequest<{ answer: string }> {
  return {
    ...makeRequest(overrides),
    schema: {
      name: "answer",
      version: "v1",
      schema: z.object({ answer: z.string() }),
    },
    ...overrides,
  };
}

function makeConfig(
  limits: Partial<ResolvedAIConfig["limits"]>,
): ResolvedAIConfig {
  return { ...config, limits: { ...config.limits, ...limits } };
}

function user(content: string, assetId?: string): AIMessage {
  return { role: "user", content, ...(assetId ? { assetId } : {}) };
}

function assistant(content: string, assetId?: string): AIMessage {
  return { role: "assistant", content, ...(assetId ? { assetId } : {}) };
}

function expectInputError(operation: () => unknown): void {
  expect(operation).toThrowError(
    expect.objectContaining({ code: "AI_INPUT_INVALID" }),
  );
}

function expectCapabilityError(operation: () => unknown): void {
  expect(operation).toThrowError(
    expect.objectContaining({ code: "AI_CAPABILITY_UNSUPPORTED" }),
  );
}
