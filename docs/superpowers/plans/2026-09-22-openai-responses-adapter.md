# OpenAI-Compatible Responses Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the backend Google Gemini `generateContent` transport with a strict, non-streaming OpenAI-compatible Responses API adapter that works with a 9Router OpenAI base URL.

**Architecture:** Preserve the existing provider-neutral `AIService`, application orchestration, asset resolution, retry, cancellation, concurrency, and persistence contracts. Replace only the provider-specific infrastructure adapter and registered API format, then update factory fixtures and operational documentation; use native `fetch` rather than adding the OpenAI SDK.

**Tech Stack:** TypeScript 5, Bun runtime, native `fetch`/`AbortSignal`, Zod 4.4.3, Vitest 3.2.4, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-09-22-openai-responses-adapter-design.md`

## Global Constraints

- Use pnpm only (`pnpm --filter backend <script>` or existing root scripts); never npm or yarn.
- The API-format ID is exactly `openai-responses`; `google-generate-content` has no compatibility alias or fallback.
- Treat profile `baseUrl` as the OpenAI API root and append `/responses` exactly once.
- Use Bearer authentication and the strict Responses API request/response contract against configurable hosts such as 9Router; do not hard-code `api.openai.com`.
- Keep the transport non-streaming and set `store: false`; do not add SSE, async iterables, background responses, or response retrieval.
- Do not add the OpenAI SDK or another runtime dependency; use native `fetch`.
- Preserve `AIService`, `ProviderAdapter`, provider-neutral request/result types, and application orchestration unchanged.
- Preserve ordered user/assistant messages, one validated JPEG/PNG/WebP image, native strict JSON Schema output, and application-side Zod validation.
- Keep `redirect: "manual"`; never expose or persist secrets, prompts, response bodies, schemas, or base64 image content.
- Missing usage fields are `null`, never zero.
- Local HTTP profiles require `AI_ALLOW_INSECURE_LOOPBACK=true`; do not weaken existing URL validation.
- Do not update the historical PRD or the superseded 2026-09-12 design/plan; they document the state and decisions at the time they were written.
- Live 9Router smoke tests require explicit user authorization and active credentials; fixture tests must not call live services.
- Do not edit tracked or untracked `.env` files during implementation; update only `.env.example` if documentation requires it.
- Before writing implementation code, use the `test-driven-development` skill and follow its red-green-refactor workflow.
- Before claiming completion, use the `verification-before-completion` skill and report actual command results.
- Do not commit unless the user explicitly requests commits; ignore commit steps below without that permission.

## File Structure

- Create `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts`: the only Responses-specific request builder, parser, and HTTP error mapper.
- Create `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.test.ts`: local HTTP fixture coverage for request translation, response normalization, refusal/incomplete states, HTTP failures, cancellation, and credential isolation.
- Delete `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.ts`: remove the obsolete Google wire contract after its replacement passes.
- Delete `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.test.ts`: remove obsolete Google fixtures after equivalent Responses coverage exists.
- Modify `apps/backend/src/infrastructure/ai-service/config.ts`: register only `openai-responses`.
- Modify `apps/backend/src/application/ai-service/services.ts`: select and construct `OpenAIResponsesAdapter`.
- Modify `apps/backend/src/application/ai-service/services.test.ts`: prove the real factory emits Responses requests and uses gateway-neutral profile configuration.
- Modify `apps/backend/src/scripts/ai-service.test.ts`: update active-provider fixture labels without changing CLI behavior.
- Modify `apps/backend/docs/ai-provider-service.md`: document 9Router base URL, Bearer auth, strict compatibility requirements, and non-streaming behavior.
- Modify `apps/backend/docs/chat-video-generator.md`: remove stale Google-only statements and describe the active Responses configuration.
- Modify `apps/backend/.env.example`: expose non-secret OpenAI-compatible key/model variable names referenced by the documented profile.

---

### Task 1: Responses Request Translation

**Files:**
- Create: `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.test.ts`
- Create: `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts`
- Reuse: `apps/backend/src/infrastructure/ai-service/http-fixture-server.test.ts`

**Interfaces:**
- Consumes: `ProviderAdapter`, `ProviderTextRequest`, `ProviderStructuredRequest`, `ResolvedAIAsset`, `ZodType`, native `fetch`.
- Produces: `OpenAIResponsesAdapterOptions` and `OpenAIResponsesAdapter implements ProviderAdapter` with `generateText(request): Promise<ProviderTextResult>` and `generateStructured(request): Promise<ProviderStructuredResult>`.

- [ ] **Step 1: Load the TDD workflow and read the approved spec**

Invoke the `test-driven-development` skill. Read `docs/superpowers/specs/2026-09-22-openai-responses-adapter-design.md`, especially Request Mapping, Endpoint And Authentication, and Structured Output. Do not copy Gemini URL-resource semantics into the new adapter; model IDs are opaque JSON values.

- [ ] **Step 2: Write failing text and image request tests**

Create `openai-responses-adapter.test.ts` with the imports, success fixture, adapter helper, and request helper below. Add the request test exactly around observable HTTP behavior:

```ts
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
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
            { role: "assistant", content: [{ type: "input_text", text: "I see it" }] },
            { role: "user", content: [{ type: "input_text", text: "Describe it" }] },
          ],
          max_output_tokens: 321,
          store: false,
        },
      });
      expect(server.requests[0]?.body).not.toHaveProperty("stream");
      expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual", signal: expect.any(AbortSignal) });
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

function makeRequest(overrides: Partial<ProviderTextRequest> = {}): ProviderTextRequest {
  return {
    requestId: "request-1",
    instructions: "System A",
    messages: [{ role: "user", content: "Hello" }],
    attempt: { attemptId: "attempt-1", attemptNumber: 1, signal: new AbortController().signal },
    ...overrides,
  };
}
```

- [ ] **Step 3: Run the request test to verify RED**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts -t "sends the Responses path"
```

Expected: FAIL because `./openai-responses-adapter` does not exist.

- [ ] **Step 4: Implement the minimal text request adapter**

Create `openai-responses-adapter.ts` with the public type/class and request mapping. Use a single `generate` path so text and structured requests cannot drift:

```ts
import { z, type ZodType } from "zod";
import type { ProviderAdapter } from "../../domain/ai-service/contracts";
import { AIError } from "../../domain/ai-service/errors";
import type {
  AIMessage,
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

export class OpenAIResponsesAdapter implements ProviderAdapter {
  constructor(private readonly options: OpenAIResponsesAdapterOptions) {}

  async generateText(request: ProviderTextRequest): Promise<ProviderTextResult> {
    return this.generate(request, undefined);
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    const result = await this.generate(request, this.getResponseFormat(request));
    return { ...result, json: result.text };
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
      ...(format ? { text: { format } } : {}),
    };
  }
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
```

Implement `generate` with `fetch(this.operationUrl(), { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body, redirect: "manual", signal })`. For this red-green step, add the smallest completed-response parser needed to return `successBody`; Task 2 expands and hardens it.

- [ ] **Step 5: Run the request test to verify GREEN**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts -t "sends the Responses path"
```

Expected: PASS.

- [ ] **Step 6: Write failing structured-output and isolation tests**

Add tests proving the exact strict schema body, pre-fetch schema failure, trailing-slash behavior, credential isolation, and abort propagation:

```ts
it("sends strict native JSON schema configuration", async () => {
  const server = await startHttpFixtureServer(() => ({
    body: { ...successBody, output: [{
      type: "message", status: "completed", role: "assistant",
      content: [{ type: "output_text", text: "{\"answer\":\"yes\",\"score\":1}" }],
    }] },
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
```

For isolation, create two fixture servers and assert each receives its own Bearer token, model, and instructions. For abort, delay the fixture response, abort the attempt controller after the request arrives, and expect `AI_CANCELLED`.

- [ ] **Step 7: Run structured tests to verify RED**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts -t "schema|isolation|abort"
```

Expected: FAIL because schema lookup/conversion and complete cancellation mapping are not implemented.

- [ ] **Step 8: Implement schema generation and cancellation mapping**

Add these exact semantics:

```ts
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
```

Wrap fetch/parse in `try/catch`. Re-throw `AIError`; if `request.attempt.signal.aborted`, throw `AI_CANCELLED`; otherwise throw non-retryable `AI_UNAVAILABLE` with `dispatchOutcome: "ambiguous"`. Use the same safe messages already used by the Google adapter so route behavior remains stable.

- [ ] **Step 9: Run all Task 1 tests**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts src/infrastructure/ai-service/http-fixture-server.test.ts
```

Expected: all request, schema, isolation, cancellation, and fixture-server tests PASS.

- [ ] **Step 10: Commit if authorized**

```bash
git add apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts apps/backend/src/infrastructure/ai-service/openai-responses-adapter.test.ts
git commit -m "feat(backend): add OpenAI Responses adapter"
```

### Task 2: Responses Normalization And Failure Mapping

**Files:**
- Modify: `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts`
- Modify: `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1's `OpenAIResponsesAdapter` and existing `AIError`, `AIUsage`, `FinishReason` types.
- Produces: deterministic normalization of completed, refusal, incomplete, failed, cancelled, malformed, HTTP-error, and network-failure Responses outcomes.

- [ ] **Step 1: Write failing completed-response normalization tests**

Add tests for the supplied 9Router shape, multiple output parts, model fallback, and nullable usage:

```ts
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
```

- [ ] **Step 2: Write failing terminal-state tests**

Add table-driven tests with explicit expected normalized outcomes:

```ts
it("maps refusal content to AI_REFUSED", async () => {
  const server = await startHttpFixtureServer(() => ({ body: {
    ...successBody,
    output: [{ type: "message", status: "completed", role: "assistant", content: [
      { type: "refusal", refusal: "sensitive provider detail" },
    ] }],
  } }), "/v1/");
  await expect(makeAdapter(server.baseUrl).generateText(makeRequest())).rejects.toMatchObject({
    code: "AI_REFUSED", providerRequestId: "resp_1", retryable: false,
  });
});

it("maps max-output incomplete response to length", async () => {
  const server = await startHttpFixtureServer(() => ({ body: {
    ...successBody,
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
```

Add explicit cases for other incomplete reasons (`AI_UNAVAILABLE`, non-retryable), `failed` (`AI_UNAVAILABLE`), `cancelled` (`AI_CANCELLED`), `queued`/`in_progress` (`AI_UNAVAILABLE`), unknown status (`AI_INVALID_OUTPUT`), malformed JSON, empty output, malformed content, and tool-only output. Assert secret refusal/error text is absent from public error messages.

- [ ] **Step 3: Run normalization tests to verify RED**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts -t "normalizes|concatenates|refusal|incomplete|failed|cancelled|tool-only|malformed"
```

Expected: FAIL for the terminal states and strict payload validation not yet implemented.

- [ ] **Step 4: Implement strict response normalization**

Define narrow local wire types rather than importing SDK types:

```ts
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
```

Implement `parseBody` to require a non-array object. Implement `normalizeResponse(body, configuredModel, requestId)` in this order:

1. Derive `providerRequestId` only from a non-empty string `id`.
2. Walk only object output items with `type === "message"`, `role === "assistant"`, and array `content`.
3. If any content item has `type === "refusal"`, throw `AI_REFUSED`.
4. Join string `output_text.text` values in array order.
5. For `completed`, require non-empty joined text and return finish reason `stop`.
6. For `incomplete` plus reason `max_output_tokens`, require non-empty text and return finish reason `length`.
7. Map the remaining statuses exactly as the spec states.
8. Map each usage field through `integerOrNull`.
9. Use a non-empty response `model`, otherwise `configuredModel`.

Keep safe errors free of provider output and refusal strings.

- [ ] **Step 5: Run normalization tests to verify GREEN**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts -t "normalizes|concatenates|refusal|incomplete|failed|cancelled|tool-only|malformed"
```

Expected: PASS.

- [ ] **Step 6: Write failing HTTP and network failure tests**

Add table-driven coverage:

```ts
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
  const result = makeAdapter(server.baseUrl).generateText(makeRequest());
  await expect(result).rejects.toSatisfy((error: AIError) => (
    error.code === code
    && error.retryable === retryable
    && error.providerStatus === status
    && error.providerRequestId === "req_error_1"
    && !error.message.includes("secret")
  ));
});
```

Import `AIError` for the predicate. Add redirect cases `301`, `302`, `307`, `308` proving the target server receives no request; `Retry-After` seconds/date cases; `x-request-id` precedence over body metadata; and a mocked `TypeError` fetch rejection proving `{ code: "AI_UNAVAILABLE", retryable: false, dispatchOutcome: "ambiguous" }`.

- [ ] **Step 7: Run failure tests to verify RED**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts -t "HTTP|redirect|Retry-After|network"
```

Expected: FAIL until the full HTTP mapper exists.

- [ ] **Step 8: Implement HTTP error parsing and safe metadata extraction**

Implement `responseError(response, requestId)` with this mapping: `400`/`422` -> non-retryable `AI_INPUT_INVALID`; `401`/`403` -> non-retryable `AI_AUTH_ERROR`; `429` -> retryable `AI_RATE_LIMITED`; `500`-`599` -> retryable `AI_UNAVAILABLE`; every other status -> non-retryable `AI_UNAVAILABLE`. Read the provider request ID from `x-request-id` first, then from a cloned/parsed error object at `request_id`, `id`, `error.request_id`, or `error.id` when each is a string. Parse `Retry-After` as integer seconds or an HTTP date relative to `Date.now()`. Never include provider body fields in `safeMessage` or diagnostics.

Do not call `response.json()` twice on the same response. Parse one error body once and pass it to request-ID extraction.

- [ ] **Step 9: Run the complete adapter suite**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts src/infrastructure/ai-service/http-fixture-server.test.ts
```

Expected: all adapter and fixture tests PASS.

- [ ] **Step 10: Commit if authorized**

```bash
git add apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts apps/backend/src/infrastructure/ai-service/openai-responses-adapter.test.ts
git commit -m "test(backend): cover Responses API outcomes"
```

### Task 3: Configuration And Factory Cutover

**Files:**
- Modify: `apps/backend/src/infrastructure/ai-service/config.ts:5,86-99`
- Modify: `apps/backend/src/application/ai-service/services.ts:9-16,91-100`
- Modify: `apps/backend/src/application/ai-service/services.test.ts:37-103,266-343`
- Modify: `apps/backend/src/scripts/ai-service.test.ts:65-84`
- Delete: `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.ts`
- Delete: `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.test.ts`

**Interfaces:**
- Consumes: Task 2's `OpenAIResponsesAdapter` and `OpenAIResponsesAdapterOptions`.
- Produces: `OPENAI_RESPONSES_FORMAT = "openai-responses"`, a factory that supports only that format, and unchanged `createAIService`/`checkConfiguredAIService` APIs.

- [ ] **Step 1: Write failing format registration tests**

Update only the active provider fixtures in `services.test.ts`:

```ts
const ACTIVE_KEY = "active-key-value";

function configuredEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    AI_PROFILES_JSON: JSON.stringify([primaryProfile()]),
    AI_TASKS_JSON: JSON.stringify([
      { task: "connection_test", profileId: "primary" },
      { task: "interviewer", profileId: "primary" },
      { task: "planner", profileId: "primary" },
      { task: "product_analysis", profileId: "primary" },
    ]),
    AI_MAX_CONCURRENCY: "3",
    AI_OPENAI_API_KEY: ACTIVE_KEY,
    AI_OPENAI_MODEL: "cx/gpt-5.6-luna",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-example",
    ...overrides,
  };
}

function primaryProfile() {
  return {
    id: "primary",
    apiFormat: "openai-responses",
    baseUrl: "https://gateway.example/v1",
    apiKeyEnv: "AI_OPENAI_API_KEY",
    modelIdEnv: "AI_OPENAI_MODEL",
    provider: "9router",
    capabilities: { text: true, vision: true, nativeStructuredOutput: true },
    limits: {
      maxInputCharacters: 20_000,
      maxOutputTokens: 2_048,
      maxImages: 1,
      maxImageBytes: 10_000_000,
      maxImageWidth: 8_192,
      maxImageHeight: 8_192,
      maxConcurrency: 3,
      attemptTimeoutMs: 30_000,
      totalDeadlineMs: 65_000,
      maxAttempts: 2,
    },
  };
}
```

Rename secondary key/model fixtures to `AI_OPENAI_SECONDARY_KEY` and `AI_OPENAI_SECONDARY_MODEL`. Update expected profile summaries to `{ provider: "9router", model: "cx/gpt-5.6-luna" }`. Change `successfulProviderResponse()` to return a completed Responses object:

```ts
function successfulProviderResponse(): Response {
  return Response.json({
    id: "provider-request",
    object: "response",
    status: "completed",
    model: "cx/gpt-5.6-luna",
    output: [{
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "ok" }],
    }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
}
```

Add a test proving the removed format fails before fetch:

```ts
it("rejects the removed Google API format before networking", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const environment = configuredEnvironment({
    AI_PROFILES_JSON: JSON.stringify([{ ...primaryProfile(), apiFormat: "google-generate-content" }]),
  });
  expect(() => checkConfiguredAIService({ environment })).toThrowError(
    expect.objectContaining({ code: "AI_CONFIG_ERROR" }),
  );
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run factory tests to verify RED**

Run:

```bash
pnpm --filter backend test -- src/application/ai-service/services.test.ts
```

Expected: FAIL because the registry still accepts only `google-generate-content` and the factory still constructs the Google adapter.

- [ ] **Step 3: Replace format registration and adapter selection**

In `config.ts`, replace the constant and registry:

```ts
export const OPENAI_RESPONSES_FORMAT = "openai-responses";

// inside configOptions
registeredApiFormats: [OPENAI_RESPONSES_FORMAT],
```

In `services.ts`, replace imports and `adapterFor`:

```ts
import {
  configOptions,
  configurationError,
  OPENAI_RESPONSES_FORMAT,
  readAIServiceConfiguration,
  type AIServiceEnvironment,
} from "@/infrastructure/ai-service/config";
import { OpenAIResponsesAdapter } from "@/infrastructure/ai-service/openai-responses-adapter";

function adapterFor(config: ResolvedAIConfig, schemas?: Readonly<Record<string, ZodType>>): ProviderAdapter {
  if (config.apiFormat !== OPENAI_RESPONSES_FORMAT) throw configurationError();
  return new OpenAIResponsesAdapter({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelId: config.modelId,
    maxOutputTokens: config.limits.maxOutputTokens,
    schemas,
  });
}
```

- [ ] **Step 4: Run factory tests to verify GREEN**

Run:

```bash
pnpm --filter backend test -- src/application/ai-service/services.test.ts
```

Expected: PASS, including concurrency tests using completed Responses fixtures.

- [ ] **Step 5: Update CLI provider fixtures and run their tests**

In `scripts/ai-service.test.ts`, change only fixture metadata:

```ts
provider: "9router",
model: "cx/gpt-5.6-luna",
```

and:

```ts
profiles: [{ id: "primary", provider: "9router", model: "cx/gpt-5.6-luna" }],
```

Run:

```bash
pnpm --filter backend test -- src/scripts/ai-service.test.ts
```

Expected: PASS with unchanged CLI safety behavior.

- [ ] **Step 6: Remove the Google adapter and verify no production references remain**

Delete:

```text
apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.ts
apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.test.ts
```

Search:

```bash
rg -n "GoogleGenerateContentAdapter|GOOGLE_GENERATE_CONTENT_FORMAT|google-generate-content" apps/backend/src
```

Expected: only the intentional rejection string in `services.test.ts` may remain; no production source match remains.

- [ ] **Step 7: Run focused AI service tests**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service src/application/ai-service src/scripts/ai-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit if authorized**

```bash
git add apps/backend/src/infrastructure/ai-service/config.ts apps/backend/src/application/ai-service/services.ts apps/backend/src/application/ai-service/services.test.ts apps/backend/src/scripts/ai-service.test.ts apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts apps/backend/src/infrastructure/ai-service/openai-responses-adapter.test.ts
git add -u apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.ts apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.test.ts
git commit -m "refactor(backend): replace Gemini with Responses API"
```

### Task 4: 9Router Configuration Documentation

**Files:**
- Modify: `apps/backend/.env.example:19-24`
- Modify: `apps/backend/docs/ai-provider-service.md:7-51,115-135`
- Modify: `apps/backend/docs/chat-video-generator.md:60-76,140-166,525-540`

**Interfaces:**
- Consumes: Task 3's `openai-responses` format and `OpenAIResponsesAdapter` behavior.
- Produces: deployable non-secret profile guidance for 9Router and corrected backend commands.

- [ ] **Step 1: Write the exact non-secret environment example**

Add these variable names under the AI provider section in `.env.example`:

```dotenv
# Profile JSON references these server-only values by name.
AI_OPENAI_API_KEY=
AI_OPENAI_MODEL=cx/gpt-5.6-luna
```

Keep `AI_PROFILES_JSON`, `AI_TASKS_JSON`, `AI_MAX_CONCURRENCY`, and `AI_ALLOW_INSECURE_LOOPBACK`. Do not place a real token in the file.

- [ ] **Step 2: Replace provider documentation with the exact 9Router profile contract**

In `ai-provider-service.md`, document:

```json
{
  "id": "local-primary",
  "apiFormat": "openai-responses",
  "baseUrl": "http://127.0.0.1:20128/v1",
  "apiKeyEnv": "AI_OPENAI_API_KEY",
  "modelIdEnv": "AI_OPENAI_MODEL",
  "provider": "9router",
  "capabilities": {
    "text": true,
    "vision": true,
    "nativeStructuredOutput": true
  },
  "limits": {
    "maxInputCharacters": 32000,
    "maxOutputTokens": 4096,
    "maxImages": 1,
    "maxImageBytes": 10485760,
    "maxImageWidth": 8192,
    "maxImageHeight": 8192,
    "maxConcurrency": 4,
    "attemptTimeoutMs": 30000,
    "totalDeadlineMs": 65000,
    "maxAttempts": 2
  }
}
```

State explicitly:

- The operation URL becomes `http://127.0.0.1:20128/v1/responses`.
- `AI_ALLOW_INSECURE_LOOPBACK=true` is required for that local HTTP URL.
- Authentication is `Authorization: Bearer <AI_OPENAI_API_KEY>`.
- The gateway/model must support Responses text, image data URLs, and strict `text.format` JSON schema before setting all three capability flags to true.
- Calls are non-streaming; streaming is outside this service contract.
- Configuration switching changes endpoint/key/model without caller edits only when the new endpoint implements the same strict `openai-responses` format.

Correct commands from the stale app filter to:

```bash
pnpm --filter backend ai:check-config
pnpm --filter backend ai:smoke:text
pnpm --filter backend ai:smoke:structured
pnpm --filter backend ai:smoke:vision
```

- [ ] **Step 3: Correct the chat-video backend documentation**

Replace references to the Google adapter and Google-only format with:

```text
apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts
openai-responses
AI_OPENAI_API_KEY
AI_OPENAI_MODEL
```

Remove the stale statement that no `/responses` adapter is registered. State that the current adapter is non-streaming and that model-specific capability support remains controlled by profile flags.

- [ ] **Step 4: Verify docs contain the new contract and no active Google guidance**

Run:

```bash
rg -n "openai-responses|/responses|AI_OPENAI_API_KEY|AI_OPENAI_MODEL|AI_ALLOW_INSECURE_LOOPBACK|non-streaming" apps/backend/.env.example apps/backend/docs/ai-provider-service.md apps/backend/docs/chat-video-generator.md
rg -n "google-generate-content|AI_GOOGLE_API_KEY|AI_GOOGLE_MODEL|GoogleGenerateContentAdapter" apps/backend/.env.example apps/backend/docs/ai-provider-service.md apps/backend/docs/chat-video-generator.md
```

Expected: the first command lists the documented configuration; the second command has no matches.

- [ ] **Step 5: Run offline config validation without a provider call**

Use an isolated command environment rather than reading or changing `.env`:

```bash
AI_PROFILES_JSON='[{"id":"local-primary","apiFormat":"openai-responses","baseUrl":"http://127.0.0.1:20128/v1","apiKeyEnv":"AI_OPENAI_API_KEY","modelIdEnv":"AI_OPENAI_MODEL","provider":"9router","capabilities":{"text":true,"vision":true,"nativeStructuredOutput":true},"limits":{"maxInputCharacters":32000,"maxOutputTokens":4096,"maxImages":1,"maxImageBytes":10485760,"maxImageWidth":8192,"maxImageHeight":8192,"maxConcurrency":4,"attemptTimeoutMs":30000,"totalDeadlineMs":65000,"maxAttempts":2}}]' AI_TASKS_JSON='[{"task":"connection_test","profileId":"local-primary"},{"task":"interviewer","profileId":"local-primary"},{"task":"planner","profileId":"local-primary"},{"task":"product_analysis","profileId":"local-primary"}]' AI_MAX_CONCURRENCY=4 AI_ALLOW_INSECURE_LOOPBACK=true AI_OPENAI_API_KEY=fixture-key AI_OPENAI_MODEL=cx/gpt-5.6-luna pnpm --filter backend ai:check-config
```

Expected: exit code 0, `AI configuration: valid`, profile/model/task labels only, and no provider HTTP request.

- [ ] **Step 6: Commit if authorized**

```bash
git add apps/backend/.env.example apps/backend/docs/ai-provider-service.md apps/backend/docs/chat-video-generator.md
git commit -m "docs(backend): document 9Router Responses setup"
```

### Task 5: Full Verification And Graph Update

**Files:**
- Verify: all files changed in Tasks 1-4
- Update generated graph: `graphify-out/**`

**Interfaces:**
- Consumes: the complete migrated adapter, factory, tests, and docs.
- Produces: evidence that deterministic tests, type checking, offline configuration, and repository graph are current.

- [ ] **Step 1: Load the completion-verification workflow**

Invoke the `verification-before-completion` skill. Do not infer success from focused tests; run every command below and retain its exit status/output summary.

- [ ] **Step 2: Run the focused adapter and factory suites**

Run:

```bash
pnpm --filter backend test -- src/infrastructure/ai-service/openai-responses-adapter.test.ts src/application/ai-service/services.test.ts src/scripts/ai-service.test.ts
```

Expected: PASS with no live network dependency.

- [ ] **Step 3: Run the full backend test suite**

Run:

```bash
pnpm --filter backend test
```

Expected: all backend Vitest suites PASS.

- [ ] **Step 4: Run TypeScript build/lint validation**

Run both existing validations:

```bash
pnpm backend:build
pnpm --filter backend lint
```

Expected: both exit 0 with no TypeScript errors.

- [ ] **Step 5: Re-run the isolated offline configuration check**

Run this isolated `ai:check-config` command without reading or changing `.env`:

```bash
AI_PROFILES_JSON='[{"id":"local-primary","apiFormat":"openai-responses","baseUrl":"http://127.0.0.1:20128/v1","apiKeyEnv":"AI_OPENAI_API_KEY","modelIdEnv":"AI_OPENAI_MODEL","provider":"9router","capabilities":{"text":true,"vision":true,"nativeStructuredOutput":true},"limits":{"maxInputCharacters":32000,"maxOutputTokens":4096,"maxImages":1,"maxImageBytes":10485760,"maxImageWidth":8192,"maxImageHeight":8192,"maxConcurrency":4,"attemptTimeoutMs":30000,"totalDeadlineMs":65000,"maxAttempts":2}}]' AI_TASKS_JSON='[{"task":"connection_test","profileId":"local-primary"},{"task":"interviewer","profileId":"local-primary"},{"task":"planner","profileId":"local-primary"},{"task":"product_analysis","profileId":"local-primary"}]' AI_MAX_CONCURRENCY=4 AI_ALLOW_INSECURE_LOOPBACK=true AI_OPENAI_API_KEY=fixture-key AI_OPENAI_MODEL=cx/gpt-5.6-luna pnpm --filter backend ai:check-config
```

Expected: exit code 0 and no paid/live provider request.

- [ ] **Step 6: Check for obsolete production references and accidental secret edits**

Run:

```bash
rg -n "GoogleGenerateContentAdapter|GOOGLE_GENERATE_CONTENT_FORMAT|AI_GOOGLE_API_KEY|AI_GOOGLE_MODEL" apps/backend/src apps/backend/docs apps/backend/.env.example
git diff --check
git status --short
```

Expected: no obsolete active-source/docs references; `git diff --check` exits 0. Inspect status and confirm no `.env` file is included in the migration diff.

- [ ] **Step 7: Update the repository knowledge graph**

Run:

```bash
graphify update .
```

Expected: graph update exits 0 and reflects the new adapter and removed Google adapter. Dirty `graphify-out` files are expected generated output and must not be reverted.

- [ ] **Step 8: Record live-smoke status accurately**

Unless the user separately authorizes paid/live provider calls, record:

```text
smoke:text: NOT RUN
smoke:structured: NOT RUN
smoke:vision: NOT RUN
```

If explicitly authorized, run one command at a time with the existing configured 9Router environment:

```bash
pnpm --filter backend ai:smoke:text
pnpm --filter backend ai:smoke:structured
pnpm --filter backend ai:smoke:vision
```

The vision command additionally requires an owned `AI_SMOKE_ASSET_ID`. Report fixture and live results separately.

- [ ] **Step 9: Commit final generated/documentation adjustments if authorized**

Before committing, inspect `git status`, `git diff`, and `git log --oneline -10`, then stage only files belonging to this migration. If graph artifacts are tracked and normally committed, include only graph changes produced by `graphify update .`.

```bash
git add graphify-out apps/backend docs/superpowers/specs/2026-09-22-openai-responses-adapter-design.md docs/superpowers/plans/2026-09-22-openai-responses-adapter.md
git commit -m "chore: finalize Responses API migration"
```
