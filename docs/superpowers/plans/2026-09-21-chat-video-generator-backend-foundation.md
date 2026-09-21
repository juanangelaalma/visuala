# Chat-Based AI Video Generator — Spikes & Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the PRD's three unverified technical dependencies with recorded spike decisions, then build the authenticated backend foundation for chat-based F&B video generation in `apps/backend` — private Supabase Storage for project assets, the full `video_*` schema, the project state machine, and the complete PRD API surface for projects, assets, chat messages, brief/storyboard revisions, approval, and render-job intake.

**Architecture:** Add isolated `domain/video`, `application/video`, and `infrastructure/video` modules plus `routes/video.ts`, mirroring the existing `ai-service` layering (`routes -> application -> domain <- infrastructure`). All state lives in Postgres and is written through repositories using the Supabase service-role client; every read and mutation is owner-scoped and additionally protected by RLS. Render jobs are persisted as immutable-snapshot rows that a later worker consumes — this plan never renders video, and never calls a model.

**Tech Stack:** TypeScript 5, Bun, ElysiaJS 1.4, Zod 4.4.3, Vitest 3.2.4, Supabase (Postgres 17 + Storage) via `@supabase/supabase-js` 2.108, `@visuala/db` for shared row types, pnpm workspaces + Turborepo.

**Spec:** `docs/prd/chat-based-ai-video-generator-mvp.md`

## Scope Of This Plan

This is plan 1 of a series. The PRD spans five loosely coupled subsystems; this plan delivers the first two.

**In scope:**

- The three technical spikes the PRD lists as prerequisites (9Router API format, HyperFrames render engine, TTS/music/moderation providers), each ending in a committed decision record.
- A `ProviderAdapter` for the 9Router API format the spike verifies, so the AI orchestration plan has a real adapter to call.
- Private Supabase Storage for project assets, behind the existing `AssetObjectStore` interface.
- The complete `video_*` database schema, its RLS/grants, and `packages/db` row types.
- The video domain model: output settings, style presets, render-compatibility allowlist, project state machine, and the brief/storyboard schemas with completeness, provenance, and timing validation.
- The full PRD API surface: projects, assets, messages, brief/storyboard revisions, approval, render-job intake/cancel, and version listing/download.

**Deliberately deferred to later plans** (interfaces are defined here so those plans do not have to change them):

- The AI orchestration plan: `interviewer`, `planner`, and `revision_planner` task callers, multi-image analysis, prompt construction, moderation calls, and the assistant reply inside `POST /video-projects/:projectId/messages`.
- The render plan: the HyperFrames `RenderEngine`, template registry and style packs, `RenderManifest` construction (it will raise the job `input_snapshot` schema version), worker process, and MP4 upload.
- The frontend plan: every `apps/app` task.

**Two decisions this plan makes that the PRD leaves open, and why:**

1. **A dedicated `video_project_assets` table instead of extending `ai_assets`.** The retained AI service contract explicitly requires that `domain/ai-service` not depend on video tables, and `AssetResolver` is the documented extension point for new asset sources. Video assets therefore get their own table, repository, and `AssetResolver` implementation, while reusing the provider-neutral `AssetObjectStore` interface (in `infrastructure/ai-service/`), the pure image parsers in `application/ai-service/image-parser.ts`, and the validation helpers exported from `application/ai-service/register-asset.ts`.
2. **`ai_assets` was kept on Cloudflare R2 by this plan, then consolidated onto Supabase Storage.** This plan deliberately left the pre-existing `ai_assets` flow on Cloudflare R2 while video assets used a separate Supabase Storage bucket, on the reasoning that each asset had exactly one canonical store. **That split has since been removed:** both the AI-service assets and the video project assets now share the single private Supabase Storage bucket (`assets`, created as `video-assets` and renamed by `20260922000000_rename_asset_bucket.sql`), behind the existing provider-neutral `AssetObjectStore` interface, and the R2 object store and its credentials were deleted. Follow-on plans should assume **one** Supabase bucket and no R2 dependency anywhere in the product.

## Global Constraints

- Use pnpm only (`pnpm --filter backend <script>`), never npm or yarn.
- Follow `routes -> application -> domain <- infrastructure`. `application` must not import `infrastructure` outside a `services.ts` factory; `domain` must not import `application` or `infrastructure`.
- Every route is authenticated through the existing `authPlugin` macros (`{ auth: true }`). Never trust a `user_id`, `status`, `id`, or `version` from a request body; derive ownership from the session.
- Service-role clients are used only inside `application/**/services.ts` factories and `infrastructure/**`. Never in a route body or in browser-reachable code.
- New `public` tables are **not** auto-exposed by Supabase. Every new table migration must enable RLS, `revoke all ... from anon, authenticated`, and grant explicitly to `service_role`.
- Revision rows are immutable once approved: grant only column-scoped `update` on the approval columns.
- Never log or persist prompts, provider payloads, API keys, signed URLs, image bytes, or file names as filesystem paths.
- Object keys are internal: `video-projects/<projectId>/<assetId>.<ext>` and `video-versions/<projectId>/<versionId>.mp4`. Never store or return a public or signed URL as a canonical reference.
- Signed URLs are short-lived and generated per request after an ownership check.
- Errors returned to clients contain only a normalized `code` and a fixed safe message. No provider or database text.
- Every production behaviour is written red-green-refactor: failing test, run it, minimal implementation, run it, then commit. Read the TDD skill's `writing-good-tests.md` before writing tests.
- Do not commit unless the user explicitly requests commits. Ignore the commit steps and report the working tree instead.
- Migrations are added to `apps/backend/supabase/migrations/` only. `apps/app/supabase/` holds no migrations.
- Task 1's decision record is authoritative over any literal field name written into Task 2. If the spike records `/responses` rather than `/chat/completions`, stop Task 2 and report; the `/responses` variant belongs in a follow-up task.

---

## Review Focus

The PRD is a vision document. These are the input classes and failure modes it implies but no acceptance criterion names, ordered by how likely they are to bite a real F&B user. Each one is pinned by a test in the task named beside it.

1. **An asset uploaded into a project that was deleted mid-request.** A user deletes a project in one tab while an upload is still in flight in another. Expected: the upload is rejected, no object is written, and no orphan `video_project_assets` row survives. — Task 10.
2. **A request body that carries `user_id`, `status`, `id`, or `version`.** A client (or a hostile caller) tries to set its own row identity or bypass a state transition. Expected: the extra keys are rejected, never merged. — Tasks 9 and 13.
3. **Two identical render requests arriving at the same time.** A double-clicked render button, or an HTTP retry, with the same idempotency key. Expected: exactly one `video_render_jobs` row and exactly one version burned — the second call returns the first job. — Task 13.
4. **The fourth rerender, and the rerender that fails for system reasons.** Expected: the fourth is refused with an explanation and consumes nothing; a job that fails before the worker starts still leaves all three rerenders available. — Task 13.
5. **Asset object bytes that changed after registration.** Someone overwrites the stored object, or a partial write truncated it. Expected: resolution fails the hash/size/dimension re-check rather than sending mutated bytes to a model or a render. — Task 10.

---

### Task 1: 9Router API-Format Spike

This is a spike task. It is not TDD — its deliverable is a decision record whose evidence must be reproducible. Every empty cell blocks Task 2.

**Files:**
- Create: `docs/decisions/2026-09-21-9router-api-format.md`

**Interfaces:**
- Consumes: the profile/task configuration contract in `apps/backend/src/infrastructure/ai-service/config.ts` (`AI_PROFILES_JSON`, `AI_TASKS_JSON`, `AI_MAX_CONCURRENCY`) and the `ProviderAdapter` interface in `apps/backend/src/domain/ai-service/contracts.ts`.
- Produces, for Task 2 and the AI orchestration plan: the registered API-format ID string, the exact operation path, the auth header name and format, the text and vision request bodies, the structured-output mechanism, the usage field names, the error status/body shape, the `Retry-After` and provider-request-ID headers, and the verified model IDs.

- [ ] **Step 1: Read the provider's official API documentation**

Read the 9Router documentation and the OpenAI-compatible API surface it exposes. Record the documentation URL and the retrieval date at the top of the decision record. Do not infer any field name from the existing Gemini adapter or from the shape of the `baseUrl`.

- [ ] **Step 2: Record the evidence form**

Create `docs/decisions/2026-09-21-9router-api-format.md` with exactly this structure:

````markdown
# Decision: 9Router API format

- **Date:** 2026-09-21
- **Status:** decided
- **Documentation:** <url> (retrieved <date>)
- **Chosen adapter ID:** `<id>` — one of `openai-chat-completions` or `openai-responses`

## Verified facts

| Question | Answer | Evidence |
|---|---|---|
| Operation path for the chosen format | | <curl> → <status + redacted body> |
| Auth header name and format | | |
| Text request body | | |
| Text response body | | |
| Vision content shape (inline base64 vs URL) | | |
| Maximum images per request | | |
| Image size limit | | |
| Structured-output mechanism | | |
| Maximum JSON schema size | | |
| Usage field names (input / output / total / cached) | | |
| Provider request ID field or header | | |
| `Retry-After` header on 429 | | |
| Redirect behaviour when following a redirect | | |
| Model IDs confirmed available | | |
| Maximum output tokens | | |
| Error status codes for invalid input / auth / rate limit / 5xx | | |

## Adapter configuration

```json
{
  "id": "9router-primary",
  "apiFormat": "<chosen adapter ID>",
  "baseUrl": "<verified base url>",
  "apiKeyEnv": "AI_9ROUTER_API_KEY",
  "modelIdEnv": "AI_9ROUTER_MODEL",
  "provider": "9router",
  "capabilities": { "text": true, "vision": true, "nativeStructuredOutput": true },
  "limits": { "...": "..." }
}
```

## Open questions carried into the AI orchestration plan

- <question or `none`>
````

- [ ] **Step 3: Probe the live endpoint**

Gather the evidence for every row. Run these only with explicit authorization, valid credentials, and a test asset, and redact every key before pasting output:

```bash
curl -sS -D - -o - \
  -H "authorization: Bearer $AI_9ROUTER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"<model>","messages":[{"role":"user","content":"reply with the word ok"}]}' \
  "$AI_9ROUTER_BASE_URL/<verified path>"
```

Repeat once with a two-image content array to answer the vision and multi-image rows, once with an invalid key to answer the auth row, and once with a deliberately malformed body to answer the invalid-input row. Paste each request and response into the evidence column, redacting the key.

- [ ] **Step 4: Fill in every cell and state the open questions**

Every "Verified facts" cell must contain an observed value or the literal text `not supported`, with the evidence that proves it. Replace every `"...": "..."` in the adapter configuration with the real limits: `maxInputCharacters`, `maxOutputTokens`, `maxImages`, `maxImageBytes`, `maxImageWidth`, `maxImageHeight`, `maxConcurrency`, `attemptTimeoutMs`, `totalDeadlineMs`, `maxAttempts`.

- [ ] **Step 5: Verify the record**

Confirm each of these before marking the task complete:

- The file exists at `docs/decisions/2026-09-21-9router-api-format.md`.
- No cell in the "Verified facts" table is empty.
- Exactly one adapter ID is named, and it is one of the two values Task 2 knows how to build.
- No API key, signed URL, or full response body containing a secret appears anywhere in the file.
- The open-questions list is present, even if it says `none`.

### Task 2: OpenAI-Compatible Chat-Completions Adapter

Read Task 1's decision record before starting. If it records `openai-responses`, stop and report — this task builds the `openai-chat-completions` variant only. Mirror the structure of `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.ts` so both adapters behave identically on cancellation, timeouts, redirects, and error mapping.

**Files:**
- Create: `apps/backend/src/infrastructure/ai-service/openai-chat-completions-adapter.ts`
- Create: `apps/backend/src/infrastructure/ai-service/openai-chat-completions-adapter.test.ts`
- Modify: `apps/backend/src/infrastructure/ai-service/config.ts` (add `OPENAI_CHAT_COMPLETIONS_FORMAT`, register it in `configOptions`)
- Modify: `apps/backend/src/application/ai-service/services.ts` (add the adapter to `adapterFor`, replace the single-format check with a registry)
- Modify: `apps/backend/src/application/ai-service/services.test.ts`

**Interfaces:**
- Consumes: `ProviderAdapter`, `ProviderTextRequest`, `ProviderStructuredRequest`, `ProviderTextResult`, `ProviderStructuredResult`, `AIError`, and `startHttpFixtureServer` from `./http-fixture-server.test`.
- Produces: `export const OPENAI_CHAT_COMPLETIONS_FORMAT = "openai-chat-completions"`, `export const REGISTERED_API_FORMATS: readonly string[]`, and `export class OpenAIChatCompletionsAdapter implements ProviderAdapter` with options `{ baseUrl, apiKey, modelId, maxOutputTokens, schemas? }`.

- [ ] **Step 1: Write the failing adapter tests**

Reuse the existing loopback fixture server: `import { startHttpFixtureServer } from "./http-fixture-server.test";` and start it with `basePath = "/v1/"`.

```ts
import { describe, expect, it } from "vitest";
import type { ProviderTextRequest } from "@/domain/ai-service/types";
import { OpenAIChatCompletionsAdapter } from "./openai-chat-completions-adapter";
import { startHttpFixtureServer } from "./http-fixture-server.test";

const PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** The fixture server defaults to the Gemini base path, so pin the OpenAI-compatible one. */
function startServer(respond: Parameters<typeof startHttpFixtureServer>[0]) {
  return startHttpFixtureServer(respond, "/v1/");
}

function request(overrides: Partial<ProviderTextRequest> = {}): ProviderTextRequest {
  return {
    requestId: "req-1",
    instructions: "You are a helpful assistant.",
    messages: [{ role: "user", content: "hello" }],
    attempt: { attemptId: "attempt-1", attemptNumber: 1, signal: new AbortController().signal },
    ...overrides,
  };
}

function adapterFor(baseUrl: string, overrides: Partial<ConstructorParameters<typeof OpenAIChatCompletionsAdapter>[0]> = {}) {
  return new OpenAIChatCompletionsAdapter({ baseUrl, apiKey: "key-a", modelId: "model-a", maxOutputTokens: 512, ...overrides });
}

describe("OpenAIChatCompletionsAdapter", () => {
  it("sends the system instruction, ordered messages, and the model on the documented path", async () => {
    const server = await startServer(() => ({
      body: { id: "chatcmpl-1", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] },
    }));
    const adapter = adapterFor(server.baseUrl);

    await adapter.generateText(request({ messages: [{ role: "user", content: "first" }, { role: "assistant", content: "second" }] }));

    expect(server.requests[0]).toMatchObject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer key-a" },
      body: {
        model: "model-a",
        max_tokens: 512,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "first" },
          { role: "assistant", content: "second" },
        ],
      },
    });
  });

  it("inlines an owned image as base64 on the message that references it", async () => {
    const server = await startServer(() => ({ body: { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] } }));
    const adapter = adapterFor(server.baseUrl);

    await adapter.generateText(request({
      messages: [{ role: "user", content: "analyze", assetId: "asset-1" }],
      asset: { assetId: "asset-1", bytes: PNG_BYTES, mimeType: "image/png" },
    }));

    const body = server.requests[0]?.body as { messages: Array<{ content: unknown }> };
    expect(body.messages[1]?.content).toEqual([
      { type: "text", text: "analyze" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}` } },
    ]);
  });

  it("normalizes usage and reports omitted usage as null", async () => {
    const withUsage = await startServer(() => ({
      body: { id: "chatcmpl-1", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } },
    }));
    const withoutUsage = await startServer(() => ({ body: { id: "chatcmpl-2", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] } }));

    await expect(adapterFor(withUsage.baseUrl).generateText(request())).resolves.toMatchObject({
      providerRequestId: "chatcmpl-1",
      finishReason: "stop",
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    });
    await expect(adapterFor(withoutUsage.baseUrl).generateText(request())).resolves.toMatchObject({
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/infrastructure/ai-service/openai-chat-completions-adapter.test.ts`

Expected: FAIL with "Failed to resolve import `./openai-chat-completions-adapter`".

- [ ] **Step 3: Implement the adapter**

Implement the transport exactly as the Gemini adapter does — native `fetch`, `redirect: "manual"`, the attempt `AbortSignal` forwarded, no SDK retries — and map errors with the same table: 400 → `AI_INPUT_INVALID`, 401/403 → `AI_AUTH_ERROR`, 429 → `AI_RATE_LIMITED` (retryable, with `Retry-After` parsed as seconds or an HTTP date), 5xx → `AI_UNAVAILABLE` (retryable), any other status → `AI_UNAVAILABLE` (not retryable). An aborted attempt maps to `AI_CANCELLED`; a non-`AIError` throw maps to `AI_UNAVAILABLE` with `dispatchOutcome: "ambiguous"`. A non-JSON body or an empty `choices[0].message.content` maps to `AI_INVALID_OUTPUT`. `finish_reason` maps `stop` → `stop`, `length` → `length`, `content_filter` → refusal error, anything else → `unknown`.

The operation URL is built once from the validated base path plus the path Task 1 verified, with the same trailing-slash normalisation as `operationUrl()` in the Gemini adapter.

```ts
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

export type OpenAIChatCompletionsAdapterOptions = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  schemas?: Readonly<Record<string, ZodType>>;
};

type ChatMessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
type ChatResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { code?: string; message?: string };
};

export class OpenAIChatCompletionsAdapter implements ProviderAdapter {
  constructor(private readonly options: OpenAIChatCompletionsAdapterOptions) {}

  async generateText(request: ProviderTextRequest): Promise<ProviderTextResult> {
    return this.generate(request, undefined);
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    const result = await this.generate(request, this.getNativeSchema(request));
    return { ...result, json: result.text };
  }

  private getNativeSchema(request: ProviderStructuredRequest): unknown {
    const schema = this.options.schemas?.[`${request.schemaName}@${request.schemaVersion}`];
    if (!schema) throw configError(request.requestId);
    try {
      return z.toJSONSchema(schema, { unrepresentable: "throw", target: "draft-7" });
    } catch {
      throw configError(request.requestId);
    }
  }

  private async generate(request: ProviderTextRequest, responseJsonSchema: unknown): Promise<ProviderTextResult> {
    try {
      return await this.fetchCompletion(request, responseJsonSchema);
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (request.attempt.signal.aborted) throw cancelledError(request.requestId);
      throw ambiguousUnavailableError(request.requestId);
    }
  }

  private async fetchCompletion(request: ProviderTextRequest, responseJsonSchema: unknown): Promise<ProviderTextResult> {
    const response = await fetch(this.operationUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify(this.requestBody(request, responseJsonSchema)),
      redirect: "manual",
      signal: request.attempt.signal,
    });
    if (!response.ok) throw await responseError(response, request.requestId);
    return normalizeResponse(await parseBody(response, request.requestId), this.options.modelId, request.requestId);
  }

  private operationUrl(): string {
    return `${this.options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  }

  private requestBody(request: ProviderTextRequest, responseJsonSchema: unknown): unknown {
    return {
      model: this.options.modelId,
      max_tokens: this.options.maxOutputTokens,
      messages: [
        { role: "system", content: request.instructions },
        ...request.messages.map((message) => ({ role: message.role, content: content(message, request.asset) })),
      ],
      ...(responseJsonSchema === undefined
        ? {}
        : { response_format: { type: "json_schema", json_schema: { name: "structured_output", schema: responseJsonSchema } } }),
    };
  }
}

function content(message: AIMessage, asset: ResolvedAIAsset | undefined): ChatMessageContent {
  if (!message.assetId || asset?.assetId !== message.assetId) return message.content;
  return [
    { type: "text", text: message.content },
    { type: "image_url", image_url: { url: `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}` } },
  ];
}
```

`parseBody`, `normalizeResponse`, `finishReason`, `integerOrNull`, `responseError`, `retryAfterMs`, and the `aiError`/`configError`/`cancelledError`/`ambiguousUnavailableError` helpers are written in the same file at the module level, copying the Gemini adapter's implementations verbatim with these substitutions: the provider request ID comes from `body.id` or the `x-request-id` response header; the finish-reason switch is `stop`/`length`/`content_filter`; and `content_filter` throws `refusedError`. `usage` reads `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens` through `integerOrNull`.

If Task 1's record says the endpoint requires `max_completion_tokens` instead of `max_tokens`, requires `strict: true` plus `additionalProperties: false` on the JSON schema, or names newer usage fields, change only `requestBody` and `usage` and update the fixtures to match the record.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter backend test -- src/infrastructure/ai-service/openai-chat-completions-adapter.test.ts`

Expected: PASS with no network traffic outside loopback.

- [ ] **Step 5: Write the failing registry tests**

Add to `apps/backend/src/application/ai-service/services.test.ts`:

```ts
it("keeps two profiles on separate credentials and formats", () => {
  const environment = configuredEnvironment();
  environment.AI_PROFILES_JSON = JSON.stringify([
    { ...profile("primary", "google-generate-content"), modelIdEnv: "AI_GOOGLE_MODEL" },
    { ...profile("router", "openai-chat-completions"), baseUrl: "https://router.example.com/v1", apiKeyEnv: "AI_9ROUTER_API_KEY", modelIdEnv: "AI_9ROUTER_MODEL" },
  ]);
  environment.AI_9ROUTER_API_KEY = "router-key";
  environment.AI_9ROUTER_MODEL = "router-model";

  const service = createAIService({ environment });

  expect(service).toBeDefined();
});
```

- [ ] **Step 6: Verify RED**

Run: `pnpm --filter backend test -- src/application/ai-service/services.test.ts`

Expected: FAIL with `AI_CONFIG_ERROR`, because `configOptions` only registers `google-generate-content`.

- [ ] **Step 7: Register the format in the factory**

In `apps/backend/src/infrastructure/ai-service/config.ts`, add the constant and register it. Do not infer the format from the URL — the format stays an explicit profile field.

```ts
export const OPENAI_CHAT_COMPLETIONS_FORMAT = "openai-chat-completions";
export const REGISTERED_API_FORMATS = [GOOGLE_GENERATE_CONTENT_FORMAT, OPENAI_CHAT_COMPLETIONS_FORMAT] as const;
```

and in `configOptions`, replace `registeredApiFormats: [GOOGLE_GENERATE_CONTENT_FORMAT]` with `registeredApiFormats: REGISTERED_API_FORMATS`.

In `apps/backend/src/application/ai-service/services.ts`, replace the `adapterFor` body with a registry lookup and import the new constant:

```ts
function adapterFor(config: ResolvedAIConfig, schemas?: Readonly<Record<string, ZodType>>): ProviderAdapter {
  const options = { baseUrl: config.baseUrl, apiKey: config.apiKey, modelId: config.modelId, maxOutputTokens: config.limits.maxOutputTokens, schemas };
  if (config.apiFormat === GOOGLE_GENERATE_CONTENT_FORMAT) return new GoogleGenerateContentAdapter(options);
  if (config.apiFormat === OPENAI_CHAT_COMPLETIONS_FORMAT) return new OpenAIChatCompletionsAdapter(options);
  throw configurationError();
}
```

- [ ] **Step 8: Verify GREEN and the offline configuration check**

Run: `pnpm --filter backend test -- src/application/ai-service/services.test.ts src/infrastructure/ai-service/config.ts`

Run: `pnpm --filter backend ai:check-config`

Expected: PASS, and the configuration check sends zero HTTP requests. If no environment configuration exists locally, the second command exits non-zero with `AI_CONFIG_ERROR` and prints no secret values — report that instead of claiming success.

- [ ] **Step 9: Commit if authorized**

```bash
git add docs/decisions/2026-09-21-9router-api-format.md apps/backend/src/infrastructure/ai-service/openai-chat-completions-adapter.ts apps/backend/src/infrastructure/ai-service/openai-chat-completions-adapter.test.ts apps/backend/src/infrastructure/ai-service/config.ts apps/backend/src/application/ai-service/services.ts apps/backend/src/application/ai-service/services.test.ts
git commit -m "feat: add openai-compatible ai provider adapter"
```

### Task 3: HyperFrames Render-Engine Spike

Spike task. Its deliverable is the capability matrix that Task 7 turns into a code allowlist, plus the timings the render plan will budget against.

**Files:**
- Create: `docs/decisions/2026-09-21-hyperframes-render-engine.md`
- Create (scratch, not committed): `$COMMANDCODE_SCRATCHPAD/hyperframes-spike/**`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: for Task 7, the list of supported `(aspectRatio, resolution, durationSeconds)` combinations; for the render plan, the install/deployment, CLI/API surface, determinism result, resource envelope, and timeout/cancellation/exit-code behaviour.

- [ ] **Step 1: Establish installation, licence, and deployment**

Read the HyperFrames documentation. Record the licence, how it is installed, whether it needs a browser runtime, and how it is deployed. Install it **only** in the scratch directory — do not add it to `apps/backend/package.json` or the lockfile in this task; the render plan owns that dependency decision.

- [ ] **Step 2: Produce a smoke composition**

Write one minimal composition in the scratch directory that exercises the three things the MVP needs: an image asset in a slot, a text block inside a safe area, and a timed scene change. Record the CLI or API calls used to validate, preview, and render it.

- [ ] **Step 3: Run the full output matrix**

Render the smoke composition for every combination the PRD must offer: 3 aspect ratios (`9:16`, `1:1`, `16:9`) × 2 resolutions (`720p`, `1080p`) × 3 durations (`6`, `10`, `15` seconds) = 18 renders. For each, record wall-clock render time, peak CPU, peak RSS, peak disk usage, and whether the output MP4 decodes with the expected resolution, aspect ratio, duration, and frame rate.

- [ ] **Step 4: Prove determinism**

Render the same composition twice from identical inputs and compare file hashes and frame-by-frame output. Record the exact hashes. If output is not byte-identical, record which layer varies (fonts, timestamps, encoder metadata) — that becomes a constraint the render plan must design around.

- [ ] **Step 5: Probe audio, captions, and failure modes**

Render once with a voice-over track, once with a music track ducked under the voice-over, and once with a caption track, and confirm all three reach the MP4. Then record: what happens on timeout, how a render is cancelled, what exit code a validation failure returns, whether temporary files are cleaned up, and what happens when two renders run concurrently.

- [ ] **Step 6: Write the decision record**

Create `docs/decisions/2026-09-21-hyperframes-render-engine.md` with exactly this structure:

````markdown
# Decision: HyperFrames render engine

- **Date:** 2026-09-21
- **Status:** decided
- **Version:** <version> · **Licence:** <licence> · **Installed via:** <method>
- **Runtime requirements:** <browser/runtime, OS packages>

## Supported combinations

| Aspect ratio | Resolution | Duration | Verified | Render time | Peak RSS |
|---|---|---|---|---|---|
| 9:16 | 720p | 6s | | | |
<!-- 18 rows total -->

**Combinations the MVP must therefore not offer:** <list, or `none`>

## Determinism

- Same-input render hashes: `<hash-1>` / `<hash-2>`
- Verdict: `byte-identical` or `deterministic-with-exceptions: <detail>`

## Audio and captions

- Voice-over: <result>
- Music ducked under voice-over: <result>
- Captions: <result>

## Operational behaviour

- Timeout: · Cancellation: · Exit codes: · Cleanup: · Local concurrency limit:
- Documented hardware for the timings above: <cpu, ram, disk, os>

## Constraints handed to the render plan

- <constraint>
````

- [ ] **Step 7: Verify the record**

Confirm all 18 matrix rows are filled, the "combinations the MVP must not offer" line is present, both determinism hashes are present, and the hardware used for the timings is named.

### Task 4: Media Provider Spike (TTS, Music, Moderation)

Spike task. It closes the three provider gaps the PRD marks **TBD** and produces the interface requirements the render and orchestration plans will implement against.

**Files:**
- Create: `docs/decisions/2026-09-21-media-providers.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: for the orchestration plan, the moderation provider and policy-version scheme; for the render plan, the TTS provider, initial language list, voice options, music source and licence model, loudness/ducking targets, and caption timing source.

- [ ] **Step 1: Enumerate candidates and evaluation criteria**

For each of the three provider slots — text-to-speech, music/audio, and moderation — list at least two candidates with pricing, latency, licence terms, data-retention terms, and whether output may be used commercially.

- [ ] **Step 2: Run a representative test for each slot**

- **TTS:** synthesize a 30-word Indonesian product pitch. Record the output format, sample rate, and whether word or phoneme timings are returned (the caption track depends on this). If timings are not returned, record what alignment method the render plan must implement.
- **Music:** obtain one candidate track and confirm the licence permits commercial use in generated video. Record the loudness of the track and of the TTS output, so the ducking rule has real numbers.
- **Moderation:** submit one benign prompt, one benign image, and one prompt that should be blocked. Record the decision, the reason code, and the policy version in each response.

- [ ] **Step 3: Write the decision record**

Create `docs/decisions/2026-09-21-media-providers.md` with exactly this structure:

````markdown
# Decision: media providers (TTS, music, moderation)

- **Date:** 2026-09-21
- **Status:** decided

## Text-to-speech

- **Provider:** <name> · **Licence/commercial use:** <terms> · **Pricing:** <model>
- Initial languages: <list> · Voices: <list>
- Output: <format, sample rate> · **Word/phoneme timings returned:** `yes` | `no` → <fallback plan>

## Music and audio

- **Source:** <catalogue or generative provider> · **Licence model:** <terms>
- User-uploaded audio in MVP: `yes` | `no`
- Measured loudness: TTS `<lufs>` · music `<lufs>` · **Ducking target:** <rule>

## Moderation

- **Provider:** <name> · **Policy version scheme:** <scheme>
- **Text:** <decision + reason code fields> · **Image:** <decision + reason code fields>
- **False-positive appeal path:** <mechanism or `deferred`>

## Interface requirements handed to later plans

- Moderation: <exact inputs and outputs the provider-neutral interface needs>
- TTS: <exact inputs and outputs, including timing data>
- Music: <selection interface and licence metadata to persist>
````

- [ ] **Step 4: Verify the record**

Confirm each slot names exactly one provider, each TBD the PRD lists for these slots has a stated answer, the measured loudness numbers are present, and no API key appears anywhere in the file.

### Task 5: Private Supabase Storage For Project Assets

**Files:**
- Create: `apps/backend/supabase/migrations/20260921000000_create_video_asset_bucket.sql`
- Create: `apps/backend/src/infrastructure/ai-service/supabase-asset-object-store.ts`
- Create: `apps/backend/src/infrastructure/ai-service/supabase-asset-object-store.test.ts`
- Modify: `apps/backend/Makefile` (pass the new variable through the local `env` target)

**Interfaces:**
- Consumes: `AssetObjectStore` and `AssetMimeType` from `apps/backend/src/domain/ai-service/assets.ts`; `createSupabaseServiceRoleClient` from `apps/backend/src/infrastructure/supabase/clients.ts`.
- Produces: `export const DEFAULT_ASSET_BUCKET = "video-assets"`, `export function readAssetBucket(environment): string`, and `export class SupabaseAssetObjectStore implements AssetObjectStore` with constructor `(client: SupabaseClient<Database>, bucket: string)`. Tasks 10 and 13 construct it; its `write`/`read`/`delete` signatures are exactly the `AssetObjectStore` contract the AI service already uses.

- [ ] **Step 1: Write the failing migration and store tests**

Follow the SQL-assertion convention already used in `supabase-asset-repository.test.ts`: read the migration from disk relative to the backend package root.

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ASSET_BUCKET, SupabaseAssetObjectStore, readAssetBucket } from "./supabase-asset-object-store";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260921000000_create_video_asset_bucket.sql"), "utf8");

describe("video asset bucket migration", () => {
  it("creates one private bucket with an image-only allowlist", () => {
    expect(migration).toMatch(/insert into storage\.buckets[\s\S]*values \('video-assets', 'video-assets', false/i);
    expect(migration).toMatch(/allowed_mime_types[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/i);
  });

  it("grants no storage.objects access to browser roles", () => {
    expect(migration).not.toMatch(/create policy[\s\S]*to (anon|authenticated)/i);
  });
});

describe("SupabaseAssetObjectStore", () => {
  it("uploads with the bucket, key, content type, and upsert disabled", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "video-projects/p-1/a-1.png" }, error: null });
    const store = new SupabaseAssetObjectStore({ storage: { from: () => ({ upload }) } } as never, DEFAULT_ASSET_BUCKET);

    await store.write("video-projects/p-1/a-1.png", Uint8Array.from([1, 2, 3]), "image/png");

    expect(upload).toHaveBeenCalledWith("video-projects/p-1/a-1.png", expect.any(Uint8Array), { contentType: "image/png", upsert: false });
  });

  it("rejects a stored object larger than the caller's limit", async () => {
    const bytes = new Uint8Array(11);
    const store = new SupabaseAssetObjectStore(
      { storage: { from: () => ({ download: vi.fn().mockResolvedValue({ data: new Blob([bytes]), error: null }) }) } } as never,
      DEFAULT_ASSET_BUCKET,
    );

    await expect(store.read("key", 10)).rejects.toThrowError("Asset object is too large.");
  });

  it("defaults the bucket and honours an explicit override", () => {
    expect(readAssetBucket({})).toBe(DEFAULT_ASSET_BUCKET);
    expect(readAssetBucket({ SUPABASE_ASSET_BUCKET: "custom" })).toBe("custom");
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/infrastructure/ai-service/supabase-asset-object-store.test.ts`

Expected: FAIL because the migration and the store do not exist.

- [ ] **Step 3: Write the migration**

```sql
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-assets', 'video-assets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
```

No policy is added for `anon` or `authenticated`, so only service-role server code can read or write this bucket. Never generate a public URL for it.

- [ ] **Step 4: Implement the store**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AssetMimeType, AssetObjectStore } from "../../domain/ai-service/assets";
import type { Database } from "@visuala/db";

export const DEFAULT_ASSET_BUCKET = "video-assets";

const environmentSchema = z.object({ SUPABASE_ASSET_BUCKET: z.string().trim().min(1).default(DEFAULT_ASSET_BUCKET) });

export function readAssetBucket(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  return environmentSchema.parse({ SUPABASE_ASSET_BUCKET: environment.SUPABASE_ASSET_BUCKET }).SUPABASE_ASSET_BUCKET;
}

export class SupabaseAssetObjectStore implements AssetObjectStore {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly bucket: string = DEFAULT_ASSET_BUCKET,
  ) {}

  async write(key: string, bytes: Uint8Array, mimeType: AssetMimeType): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, bytes, { contentType: mimeType, upsert: false });
    if (error) throw error;
  }

  async read(key: string, maxBytes: number): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error) throw error;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("Asset object is too large.");
    return bytes;
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw error;
  }
}
```

Note: `read` deliberately does not pass `maxBytes` to the network layer, matching `R2ObjectStore`, which also enforces the cap after the fact. Do not add a signed-URL method here — signed URLs are generated by the version/asset use cases after an ownership check so that no caller can mint one for an asset it does not own.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter backend test -- src/infrastructure/ai-service/supabase-asset-object-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Pass the new variable through the local environment target**

`apps/backend/Makefile` builds `.env` by grepping an allowlist out of `../app/.env`, which currently drops every AI and R2 variable. Extend the `grep -E` pattern in the `env:` target so local development receives the AI, renderer, and bucket configuration:

```make
		  grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ASSET_BUCKET|ADMIN_EMAILS|AI_[A-Z0-9_]+|R2_[A-Z0-9_]+|BILLING_[A-Z_]+|XENDIT_[A-Z_]+)=' ../app/.env; \
```

- [ ] **Step 7: Verify the Makefile change and lint**

Run: `make -C apps/backend env` into a scratch copy, or `grep -n 'SUPABASE_ASSET_BUCKET' apps/backend/Makefile` to confirm the pattern took, then run `pnpm backend:build`.

Expected: the Makefile target reports ".env already exists - leaving it untouched" (do not delete a developer's `.env`), and the typecheck passes.

- [ ] **Step 8: Commit if authorized**

```bash
git add apps/backend/supabase/migrations/20260921000000_create_video_asset_bucket.sql apps/backend/src/infrastructure/ai-service/supabase-asset-object-store.ts apps/backend/src/infrastructure/ai-service/supabase-asset-object-store.test.ts apps/backend/Makefile
git commit -m "feat: store project assets in private supabase storage"
```

### Task 6: Video Database Schema And Row Types

**Files:**
- Create: `apps/backend/supabase/migrations/20260921000100_create_video_projects.sql`
- Create: `apps/backend/supabase/migrations/20260921000200_create_video_revisions.sql`
- Create: `apps/backend/supabase/migrations/20260921000300_create_video_render_jobs.sql`
- Create: `apps/backend/src/infrastructure/video/video-migrations.test.ts`
- Modify: `packages/db/src/database.types.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, for every later task: the tables `video_projects`, `video_project_assets`, `video_messages`, `video_brief_revisions`, `video_storyboard_revisions`, `video_render_jobs`, `video_versions`, `video_moderation_events`; the shared `public.set_video_updated_at()` trigger function; and the `Database["public"]["Tables"][...]` row types in `@visuala/db`.

The status and enum value sets below are the ones every later task uses. Copy them exactly:

- `video_projects.status`: `draft`, `interviewing`, `awaiting_approval`, `approved`, `rendering`, `ready`, `revision_draft`, `moderation_blocked`, `failed`, `deleted`
- `video_projects.video_type`: `product_promo`, `discount_promo`, `product_launch`, `menu_showcase`
- `video_projects.style_id`: `bold_pop`, `clean_product`, `warm_artisan`, `premium_dark`
- `video_render_jobs.status`: `queued`, `preparing`, `rendering`, `uploading`, `succeeded`, `failed`, `cancelled`

- [ ] **Step 1: Write the failing schema tests**

Migration assertions in this repository are text assertions against the SQL file. Use the same style as `supabase-usage-recorder.test.ts`.

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = (name: string) => readFileSync(resolve(process.cwd(), `supabase/migrations/${name}`), "utf8");
const projects = sql("20260921000100_create_video_projects.sql");
const revisions = sql("20260921000200_create_video_revisions.sql");
const jobs = sql("20260921000300_create_video_render_jobs.sql");

describe("video schema", () => {
  it("creates every table named in the PRD data model", () => {
    const all = `${projects}${revisions}${jobs}`;
    for (const table of ["video_projects", "video_project_assets", "video_messages", "video_brief_revisions", "video_storyboard_revisions", "video_render_jobs", "video_versions", "video_moderation_events"]) {
      expect(all).toContain(`create table public.${table} `);
    }
  });

  it("denies browser roles and grants service_role on every table", () => {
    for (const [name, migration] of [["projects", projects], ["revisions", revisions], ["jobs", jobs]] as const) {
      const created = [...migration.matchAll(/create table public\.([a-z_]+) /g)].map((match) => match[1]);
      expect(created.length, `${name} migration creates at least one table`).toBeGreaterThan(0);
      for (const table of created) {
        expect(migration, `${table} enables row level security`).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
        expect(migration, `${table} is revoked from browser roles`).toMatch(new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`));
        expect(migration, `${table} is granted to service_role`).toMatch(new RegExp(`grant (select, insert, update, delete|select, insert, delete|select, insert|insert) on table public\\.${table} to service_role`));
      }
    }
  });

  it("makes approved revisions immutable with column scoped grants", () => {
    expect(revisions).toMatch(/grant update \(is_complete\) on public\.video_brief_revisions to service_role/i);
    expect(revisions).toMatch(/grant update \(approved_at, approval_snapshot\) on public\.video_storyboard_revisions to service_role/i);
    expect(revisions).not.toMatch(/grant select, insert, update, delete on table public\.video_(brief|storyboard)_revisions/i);
  });

  it("permits at most one active render job per project", () => {
    expect(jobs).toMatch(/create unique index video_render_jobs_active_project_idx on public\.video_render_jobs \(project_id\) where status in \('queued', 'preparing', 'rendering', 'uploading'\)/i);
    expect(jobs).toMatch(/unique \(project_id, idempotency_key\)/i);
  });

  it("keeps the revision duration equal to a supported project duration", () => {
    expect(projects).toMatch(/duration_seconds in \(6, 10, 15\)/i);
    expect(revisions).toMatch(/total_duration_seconds integer not null check \(total_duration_seconds in \(6, 10, 15\)\)/i);
  });

  it("caps the rerender counter at three", () => {
    expect(projects).toMatch(/revision_render_count integer not null default 0 check \(revision_render_count >= 0 and revision_render_count <= 3\)/i);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/infrastructure/video/video-migrations.test.ts`

Expected: FAIL with ENOENT for the migration files.

- [ ] **Step 3: Write `20260921000100_create_video_projects.sql`**

```sql
begin;

create table public.video_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  video_type text not null check (video_type in ('product_promo', 'discount_promo', 'product_launch', 'menu_showcase')),
  style_id text not null check (style_id in ('bold_pop', 'clean_product', 'warm_artisan', 'premium_dark')),
  duration_seconds integer not null check (duration_seconds in (6, 10, 15)),
  aspect_ratio text not null check (aspect_ratio in ('9:16', '1:1', '16:9')),
  resolution text not null check (resolution in ('720p', '1080p')),
  language text not null check (char_length(language) between 2 and 12),
  voice_over_enabled boolean not null default true,
  music_enabled boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'interviewing', 'awaiting_approval', 'approved', 'rendering', 'ready', 'revision_draft', 'moderation_blocked', 'failed', 'deleted')),
  revision_render_count integer not null default 0 check (revision_render_count >= 0 and revision_render_count <= 3),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index video_projects_user_created_at_idx on public.video_projects (user_id, created_at desc);
create index video_projects_user_status_idx on public.video_projects (user_id, status);

create table public.video_project_assets (
  id uuid primary key,
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  object_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  rights_confirmed_at timestamptz not null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'allowed', 'blocked')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index video_project_assets_project_created_at_idx on public.video_project_assets (project_id, created_at);

create table public.video_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  controls jsonb,
  asset_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index video_messages_project_created_at_idx on public.video_messages (project_id, created_at);

create function public.set_video_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_video_projects_updated_at
before update on public.video_projects
for each row execute function public.set_video_updated_at();

alter table public.video_projects enable row level security;
revoke all on table public.video_projects from anon, authenticated;
grant select, insert, update, delete on table public.video_projects to service_role;

alter table public.video_project_assets enable row level security;
revoke all on table public.video_project_assets from anon, authenticated;
grant select, insert, update, delete on table public.video_project_assets to service_role;

alter table public.video_messages enable row level security;
revoke all on table public.video_messages from anon, authenticated;
grant select, insert, update, delete on table public.video_messages to service_role;

commit;
```

- [ ] **Step 4: Write `20260921000200_create_video_revisions.sql`**

```sql
begin;

create table public.video_brief_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version integer not null check (version > 0),
  schema_version text not null,
  brief jsonb not null,
  is_complete boolean not null default false,
  generated_by jsonb not null,
  source_message_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index video_brief_revisions_project_version_idx on public.video_brief_revisions (project_id, version desc);

create table public.video_storyboard_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version integer not null check (version > 0),
  schema_version text not null,
  brief_revision_id uuid not null references public.video_brief_revisions(id) on delete restrict,
  scenes jsonb not null,
  total_duration_seconds integer not null check (total_duration_seconds in (6, 10, 15)),
  generated_by jsonb not null,
  approved_at timestamptz,
  approval_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  check ((approved_at is null) = (approval_snapshot is null))
);

create index video_storyboard_revisions_project_version_idx on public.video_storyboard_revisions (project_id, version desc);

alter table public.video_brief_revisions enable row level security;
revoke all on table public.video_brief_revisions from anon, authenticated;
grant select, insert, delete on table public.video_brief_revisions to service_role;
grant update (is_complete) on public.video_brief_revisions to service_role;

alter table public.video_storyboard_revisions enable row level security;
revoke all on table public.video_storyboard_revisions from anon, authenticated;
grant select, insert, delete on table public.video_storyboard_revisions to service_role;
grant update (approved_at, approval_snapshot) on public.video_storyboard_revisions to service_role;

commit;
```

`generated_by` is a `jsonb` snapshot `{ profileId, provider, model, promptVersion, requestId }` written by the AI orchestration layer and copied into the approval snapshot. The column-scoped grants are what make an approved revision physically immutable: service-role code cannot update `brief` or `scenes` after insert.

- [ ] **Step 5: Write `20260921000300_create_video_render_jobs.sql`**

```sql
begin;

create table public.video_render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  brief_revision_id uuid not null references public.video_brief_revisions(id) on delete restrict,
  storyboard_revision_id uuid not null references public.video_storyboard_revisions(id) on delete restrict,
  parent_version_id uuid,
  is_revision boolean not null,
  input_snapshot jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'preparing', 'rendering', 'uploading', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);

create unique index video_render_jobs_active_project_idx on public.video_render_jobs (project_id) where status in ('queued', 'preparing', 'rendering', 'uploading');
create index video_render_jobs_status_queued_at_idx on public.video_render_jobs (status, queued_at);
create index video_render_jobs_user_created_at_idx on public.video_render_jobs (user_id, created_at desc);

create table public.video_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version_number integer not null check (version_number > 0),
  render_job_id uuid not null unique references public.video_render_jobs(id) on delete restrict,
  parent_version_id uuid references public.video_versions(id) on delete restrict,
  output_object_key text not null unique,
  duration_seconds integer not null check (duration_seconds > 0),
  aspect_ratio text not null,
  resolution text not null,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create index video_versions_project_version_idx on public.video_versions (project_id, version_number desc);

create table public.video_moderation_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  subject_type text not null check (subject_type in ('prompt', 'asset', 'message')),
  subject_id text not null,
  provider text not null,
  policy_version text not null,
  decision text not null check (decision in ('allowed', 'blocked', 'review')),
  reason_code text,
  created_at timestamptz not null default now()
);

create index video_moderation_events_project_created_at_idx on public.video_moderation_events (project_id, created_at desc);

create trigger set_video_render_jobs_updated_at
before update on public.video_render_jobs
for each row execute function public.set_video_updated_at();

alter table public.video_render_jobs enable row level security;
revoke all on table public.video_render_jobs from anon, authenticated;
grant select, insert, update, delete on table public.video_render_jobs to service_role;

alter table public.video_versions enable row level security;
revoke all on table public.video_versions from anon, authenticated;
grant select, insert, update, delete on table public.video_versions to service_role;

alter table public.video_moderation_events enable row level security;
revoke all on table public.video_moderation_events from anon, authenticated;
grant select, insert, update, delete on table public.video_moderation_events to service_role;

commit;
```

`video_render_jobs.input_snapshot` intentionally has no template columns. The render plan adds template and style-pack versions by raising the snapshot schema version; it does not change the `POST /video-projects/:projectId/render-jobs` request contract.

- [ ] **Step 6: Add the row types to `packages/db/src/database.types.ts`**

Add these entries to `Tables`, keeping the file's existing alphabetical ordering and one-line style:

```ts
      video_brief_revisions: {
        Row: { id: string; project_id: string; user_id: string; version: number; schema_version: string; brief: unknown; is_complete: boolean; generated_by: unknown; source_message_ids: string[]; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; version: number; schema_version: string; brief: unknown; is_complete?: boolean; generated_by: unknown; source_message_ids?: string[]; created_at?: string };
        Update: { is_complete?: boolean };
        Relationships: [{ foreignKeyName: "video_brief_revisions_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_messages: {
        Row: { id: string; project_id: string; user_id: string; role: "user" | "assistant"; content: string; controls: unknown; asset_ids: string[]; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; role: "user" | "assistant"; content: string; controls?: unknown; asset_ids?: string[]; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_messages"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_messages_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_moderation_events: {
        Row: { id: string; project_id: string; user_id: string; subject_type: "prompt" | "asset" | "message"; subject_id: string; provider: string; policy_version: string; decision: "allowed" | "blocked" | "review"; reason_code: string | null; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; subject_type: "prompt" | "asset" | "message"; subject_id: string; provider: string; policy_version: string; decision: "allowed" | "blocked" | "review"; reason_code?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_moderation_events"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_moderation_events_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_project_assets: {
        Row: { id: string; project_id: string; user_id: string; object_key: string; mime_type: "image/jpeg" | "image/png" | "image/webp"; byte_size: number; sha256: string; width: number; height: number; rights_confirmed_at: string; moderation_status: "pending" | "allowed" | "blocked"; deleted_at: string | null; created_at: string };
        Insert: { id: string; project_id: string; user_id: string; object_key: string; mime_type: "image/jpeg" | "image/png" | "image/webp"; byte_size: number; sha256: string; width: number; height: number; rights_confirmed_at: string; moderation_status?: "pending" | "allowed" | "blocked"; deleted_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_project_assets"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_project_assets_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_projects: {
        Row: { id: string; user_id: string; title: string; video_type: "product_promo" | "discount_promo" | "product_launch" | "menu_showcase"; style_id: "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark"; duration_seconds: 6 | 10 | 15; aspect_ratio: "9:16" | "1:1" | "16:9"; resolution: "720p" | "1080p"; language: string; voice_over_enabled: boolean; music_enabled: boolean; status: "draft" | "interviewing" | "awaiting_approval" | "approved" | "rendering" | "ready" | "revision_draft" | "moderation_blocked" | "failed" | "deleted"; revision_render_count: number; deleted_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; title: string; video_type: "product_promo" | "discount_promo" | "product_launch" | "menu_showcase"; style_id: "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark"; duration_seconds: 6 | 10 | 15; aspect_ratio: "9:16" | "1:1" | "16:9"; resolution: "720p" | "1080p"; language: string; voice_over_enabled?: boolean; music_enabled?: boolean; status?: "draft" | "interviewing" | "awaiting_approval" | "approved" | "rendering" | "ready" | "revision_draft" | "moderation_blocked" | "failed" | "deleted"; revision_render_count?: number; deleted_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_projects"]["Row"]>;
        Relationships: [];
      };
      video_render_jobs: {
        Row: { id: string; project_id: string; user_id: string; idempotency_key: string; brief_revision_id: string; storyboard_revision_id: string; parent_version_id: string | null; is_revision: boolean; input_snapshot: unknown; status: "queued" | "preparing" | "rendering" | "uploading" | "succeeded" | "failed" | "cancelled"; attempts: number; queued_at: string; started_at: string | null; finished_at: string | null; error_code: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; project_id: string; user_id: string; idempotency_key: string; brief_revision_id: string; storyboard_revision_id: string; parent_version_id?: string | null; is_revision: boolean; input_snapshot: unknown; status?: "queued" | "preparing" | "rendering" | "uploading" | "succeeded" | "failed" | "cancelled"; attempts?: number; queued_at?: string; started_at?: string | null; finished_at?: string | null; error_code?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_render_jobs"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_render_jobs_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_storyboard_revisions: {
        Row: { id: string; project_id: string; user_id: string; version: number; schema_version: string; brief_revision_id: string; scenes: unknown; total_duration_seconds: 6 | 10 | 15; generated_by: unknown; approved_at: string | null; approval_snapshot: unknown; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; version: number; schema_version: string; brief_revision_id: string; scenes: unknown; total_duration_seconds: 6 | 10 | 15; generated_by: unknown; approved_at?: string | null; approval_snapshot?: unknown; created_at?: string };
        Update: { approved_at?: string | null; approval_snapshot?: unknown };
        Relationships: [{ foreignKeyName: "video_storyboard_revisions_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_versions: {
        Row: { id: string; project_id: string; user_id: string; version_number: number; render_job_id: string; parent_version_id: string | null; output_object_key: string; duration_seconds: number; aspect_ratio: string; resolution: string; manifest_hash: string; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; version_number: number; render_job_id: string; parent_version_id?: string | null; output_object_key: string; duration_seconds: number; aspect_ratio: string; resolution: string; manifest_hash: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_versions"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_versions_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
```

- [ ] **Step 7: Verify GREEN**

Run: `pnpm --filter backend test -- src/infrastructure/video/video-migrations.test.ts`

Run: `pnpm backend:build`

Expected: PASS and a clean typecheck. The `video_render_jobs.parent_version_id` and `video_versions.parent_version_id` columns deliberately have no foreign key to `video_versions` in the row types: the Jobs migration declares `video_render_jobs.parent_version_id` as a bare `uuid` to avoid a circular table-creation dependency with `video_versions`, and the repository layer validates it.

- [ ] **Step 8: Commit if authorized**

```bash
git add apps/backend/supabase/migrations/20260921000100_create_video_projects.sql apps/backend/supabase/migrations/20260921000200_create_video_revisions.sql apps/backend/supabase/migrations/20260921000300_create_video_render_jobs.sql apps/backend/src/infrastructure/video/video-migrations.test.ts packages/db/src/database.types.ts
git commit -m "feat: add video project schema"
```

### Task 7: Video Domain Model, Settings, And Project State Machine

**Files:**
- Create: `apps/backend/src/domain/video/types.ts`
- Create: `apps/backend/src/domain/video/errors.ts`
- Create: `apps/backend/src/domain/video/contracts.ts`
- Create: `apps/backend/src/domain/video/settings.ts`
- Create: `apps/backend/src/domain/video/render-compatibility.ts`
- Create: `apps/backend/src/domain/video/limits.ts`
- Create: `apps/backend/src/domain/video/state-machine.ts`
- Test: `apps/backend/src/domain/video/settings.test.ts`
- Test: `apps/backend/src/domain/video/render-compatibility.test.ts`
- Test: `apps/backend/src/domain/video/limits.test.ts`
- Test: `apps/backend/src/domain/video/state-machine.test.ts`

**Interfaces:**
- Consumes: `AssetMimeType` from `../ai-service/assets` for asset entity typing only.
- Produces, for Tasks 9–13: `VideoType`, `VideoDurationSeconds`, `VideoAspectRatio`, `VideoResolution`, `VideoStyleId`, `VideoProjectStatus`, `VideoRenderJobStatus`, `VideoOutputSettings`, `VideoProject`, `ProjectAsset`, `VideoMessage`, `VideoBriefRevision`, `VideoStoryboardRevision`, `VideoRenderJob`, `VideoVersion`; `VideoError` and `VideoErrorCode`; `validateOutputSettings`, `isSupportedLanguage`, `VIDEO_STYLE_PRESETS`, `isRenderCombinationSupported`; `readAssetLimits`, `MAX_RERENDERS_PER_PROJECT`; `assertVideoProjectTransition`, `canTransitionVideoProjectStatus`, `canMutateProjectAssets`, `isRenderJobActive`; and the repository interfaces in `contracts.ts`.

`types.ts` and `contracts.ts` hold types only and are excluded from coverage by `vitest.config.mts`, matching the `ai-service` convention. All logic lives in the covered files.

- [ ] **Step 1: Write the failing state-machine and settings tests**

```ts
import { describe, expect, it } from "vitest";
import { assertVideoProjectTransition, canMutateProjectAssets, canTransitionVideoProjectStatus } from "./state-machine";
import { VIDEO_STYLE_PRESETS, isSupportedLanguage, validateOutputSettings } from "./settings";

describe("video project state machine", () => {
  it("walks the PRD flow", () => {
    expect(canTransitionVideoProjectStatus("draft", "interviewing")).toBe(true);
    expect(canTransitionVideoProjectStatus("interviewing", "awaiting_approval")).toBe(true);
    expect(canTransitionVideoProjectStatus("awaiting_approval", "approved")).toBe(true);
    expect(canTransitionVideoProjectStatus("approved", "rendering")).toBe(true);
    expect(canTransitionVideoProjectStatus("rendering", "ready")).toBe(true);
    expect(canTransitionVideoProjectStatus("ready", "revision_draft")).toBe(true);
    expect(canTransitionVideoProjectStatus("revision_draft", "awaiting_approval")).toBe(true);
  });

  it("refuses to render straight out of a revision draft", () => {
    expect(canTransitionVideoProjectStatus("revision_draft", "rendering")).toBe(false);
  });

  it("allows moderation, failure, and deletion from every active state", () => {
    for (const status of ["draft", "interviewing", "awaiting_approval", "approved", "rendering", "ready", "revision_draft"] as const) {
      expect(canTransitionVideoProjectStatus(status, "deleted")).toBe(true);
      expect(canTransitionVideoProjectStatus(status, "failed")).toBe(true);
      expect(canTransitionVideoProjectStatus(status, "moderation_blocked")).toBe(true);
    }
  });

  it("treats a repeated target state as idempotent and anything else as a conflict", () => {
    expect(() => assertVideoProjectTransition("approved", "approved")).not.toThrow();
    expect(() => assertVideoProjectTransition("ready", "interviewing")).toThrowError(
      expect.objectContaining({ code: "video_state_conflict" }),
    );
  });

  it("only mutates assets in editable states", () => {
    expect(["draft", "interviewing", "awaiting_approval", "revision_draft"].every(canMutateProjectAssets)).toBe(true);
    expect(["approved", "rendering", "ready", "failed", "deleted"].some(canMutateProjectAssets)).toBe(false);
  });
});

describe("video output settings", () => {
  it("accepts every combination the render engine verified", () => {
    expect(validateOutputSettings({ durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true }))
      .toMatchObject({ durationSeconds: 10 });
  });

  it("rejects an unsupported duration, ratio, resolution, or language", () => {
    expect(() => validateOutputSettings(settings({ durationSeconds: 7 as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
    expect(() => validateOutputSettings(settings({ aspectRatio: "4:5" as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
    expect(() => validateOutputSettings(settings({ resolution: "4k" as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
    expect(() => validateOutputSettings(settings({ language: "xx" as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
  });

  it("publishes all four style presets with preview text", () => {
    expect(VIDEO_STYLE_PRESETS.map((preset) => preset.id)).toEqual(["bold_pop", "clean_product", "warm_artisan", "premium_dark"]);
    expect(VIDEO_STYLE_PRESETS.every((preset) => preset.label.length > 0 && preset.description.length > 0)).toBe(true);
  });

  it("knows which languages the TTS decision record enabled", () => {
    expect(isSupportedLanguage("id")).toBe(true);
    expect(isSupportedLanguage("en")).toBe(true);
    expect(isSupportedLanguage("fr")).toBe(false);
  });
});
```

with this local helper at the top of `settings.test.ts`:

```ts
function settings(overrides: Partial<VideoOutputSettings> = {}): VideoOutputSettings {
  return { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true, ...overrides };
}
```

Two more test files belong to this same step, because `settings.ts` cannot be implemented without the compatibility allowlist they pin:

```ts
// apps/backend/src/domain/video/render-compatibility.test.ts
import { describe, expect, it } from "vitest";
import { RENDER_SUPPORTED_COMBINATIONS, assertRenderCombinationSupported, isRenderCombinationSupported } from "./render-compatibility";

describe("render compatibility", () => {
  it("covers the whole 3 x 2 x 3 matrix the PRD must offer", () => {
    expect(RENDER_SUPPORTED_COMBINATIONS).toHaveLength(18);
    const distinct = new Set(RENDER_SUPPORTED_COMBINATIONS.map((entry) => `${entry.aspectRatio}/${entry.resolution}/${entry.durationSeconds}`));
    expect(distinct.size).toBe(18);
  });

  it("rejects a combination the renderer did not verify", () => {
    expect(isRenderCombinationSupported({ aspectRatio: "4:5" as never, resolution: "720p", durationSeconds: 6 })).toBe(false);
    expect(isRenderCombinationSupported({ aspectRatio: "9:16", resolution: "1080p", durationSeconds: 6 })).toBe(true);
    expect(() => assertRenderCombinationSupported({ aspectRatio: "16:9", resolution: "4k" as never, durationSeconds: 10 }))
      .toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
  });
});
```

```ts
// apps/backend/src/domain/video/limits.test.ts
import { describe, expect, it } from "vitest";
import { MAX_RERENDERS_PER_PROJECT, readAssetLimits } from "./limits";

describe("video limits", () => {
  it("caps rerenders at the PRD limit", () => {
    expect(MAX_RERENDERS_PER_PROJECT).toBe(3);
  });

  it("falls back to the documented defaults", () => {
    expect(readAssetLimits({})).toEqual({ maxAssetsPerProject: 8, maxProjectAssetBytes: 41943040, minImageDimension: 200, maxImageDimension: 8000 });
  });

  it("honours an environment override and rejects a non-numeric one", () => {
    expect(readAssetLimits({ VIDEO_MAX_ASSETS_PER_PROJECT: "3" }).maxAssetsPerProject).toBe(3);
    expect(() => readAssetLimits({ VIDEO_MAX_ASSETS_PER_PROJECT: "many" })).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/domain/video`

Expected: FAIL for all four test files, because the `domain/video` modules do not exist.

- [ ] **Step 3: Implement `types.ts` and `errors.ts`**

```ts
// apps/backend/src/domain/video/types.ts
import type { AssetMimeType } from "../ai-service/assets";

export type VideoType = "product_promo" | "discount_promo" | "product_launch" | "menu_showcase";
export type VideoDurationSeconds = 6 | 10 | 15;
export type VideoAspectRatio = "9:16" | "1:1" | "16:9";
export type VideoResolution = "720p" | "1080p";
export type VideoStyleId = "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark";
export type VideoLanguage = string;

export type VideoProjectStatus =
  | "draft" | "interviewing" | "awaiting_approval" | "approved" | "rendering"
  | "ready" | "revision_draft" | "moderation_blocked" | "failed" | "deleted";

export type VideoRenderJobStatus = "queued" | "preparing" | "rendering" | "uploading" | "succeeded" | "failed" | "cancelled";

export type VideoOutputSettings = {
  durationSeconds: VideoDurationSeconds;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  language: VideoLanguage;
  voiceOverEnabled: boolean;
  musicEnabled: boolean;
};

export type VideoProject = {
  id: string;
  userId: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  status: VideoProjectStatus;
  settings: VideoOutputSettings;
  revisionRenderCount: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAsset = {
  id: string;
  projectId: string;
  userId: string;
  objectKey: string;
  mimeType: AssetMimeType;
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
  rightsConfirmedAt: string;
  moderationStatus: "pending" | "allowed" | "blocked";
  deletedAt?: string;
  createdAt: string;
};

export type VideoMessage = {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  controls: unknown;
  assetIds: string[];
  createdAt: string;
};

export type GeneratedBy = { profileId: string; provider: string; model: string; promptVersion: string; requestId: string };

export type VideoBriefRevision = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  schemaVersion: string;
  brief: unknown;
  isComplete: boolean;
  generatedBy: GeneratedBy;
  sourceMessageIds: string[];
  createdAt: string;
};

export type VideoStoryboardRevision = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  schemaVersion: string;
  briefRevisionId: string;
  scenes: unknown;
  totalDurationSeconds: VideoDurationSeconds;
  generatedBy: GeneratedBy;
  approvedAt?: string;
  approvalSnapshot?: unknown;
  createdAt: string;
};

export type VideoRenderJob = {
  id: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  briefRevisionId: string;
  storyboardRevisionId: string;
  parentVersionId?: string;
  isRevision: boolean;
  inputSnapshot: unknown;
  status: VideoRenderJobStatus;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type VideoVersion = {
  id: string;
  projectId: string;
  userId: string;
  versionNumber: number;
  renderJobId: string;
  parentVersionId?: string;
  outputObjectKey: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  manifestHash: string;
  createdAt: string;
};
```

```ts
// apps/backend/src/domain/video/errors.ts
export type VideoErrorCode =
  | "video_project_not_found"
  | "video_render_job_not_found"
  | "video_version_not_found"
  | "video_input_invalid"
  | "video_asset_invalid"
  | "video_asset_limit_reached"
  | "video_approval_incomplete"
  | "video_state_conflict"
  | "video_revision_quota_exhausted";

export class VideoError extends Error {
  readonly code: VideoErrorCode;

  constructor(code: VideoErrorCode, message: string) {
    super(message);
    this.name = "VideoError";
    this.code = code;
  }
}
```

Ownership failures use `video_project_not_found`, never a distinct "forbidden" code, so a caller cannot probe for the existence of another user's project.

- [ ] **Step 4: Implement `settings.ts`, `render-compatibility.ts`, and `limits.ts`**

```ts
// apps/backend/src/domain/video/settings.ts
import { z } from "zod";
import { VideoError } from "./errors";
import { assertRenderCombinationSupported } from "./render-compatibility";
import type { VideoAspectRatio, VideoDurationSeconds, VideoOutputSettings, VideoResolution, VideoStyleId } from "./types";

export const VIDEO_TYPES = ["product_promo", "discount_promo", "product_launch", "menu_showcase"] as const;
/** The single source of truth for the video-type literals; Task 12 reuses it rather than inlining a copy. */
export const videoTypeSchema = z.enum(VIDEO_TYPES);
export const VIDEO_DURATIONS_SECONDS = [6, 10, 15] as const;
export const VIDEO_ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
export const VIDEO_STYLE_IDS = ["bold_pop", "clean_product", "warm_artisan", "premium_dark"] as const;

/** Languages the TTS decision record confirmed. Update from docs/decisions/2026-09-21-media-providers.md only. */
export const VIDEO_LANGUAGES = ["id", "en"] as const;

export const VIDEO_STYLE_PRESETS: readonly { id: VideoStyleId; label: string; description: string }[] = [
  { id: "bold_pop", label: "Bold Pop", description: "Warna tebal, kontras tinggi, dan gerak cepat untuk promo yang mencolok." },
  { id: "clean_product", label: "Clean Product", description: "Latar bersih dan fokus penuh pada produk, cocok untuk katalog." },
  { id: "warm_artisan", label: "Warm Artisan", description: "Nuansa hangat dan tekstur lembut untuk produk rumahan." },
  { id: "premium_dark", label: "Premium Dark", description: "Latar gelap dan aksen elegan untuk kesan eksklusif." },
];

export const outputSettingsSchema = z.object({
  durationSeconds: z.union([z.literal(6), z.literal(10), z.literal(15)]),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  language: z.string().trim().min(2).max(12),
  voiceOverEnabled: z.boolean(),
  musicEnabled: z.boolean(),
}).strict();

export function isSupportedLanguage(language: string): boolean {
  return (VIDEO_LANGUAGES as readonly string[]).includes(language);
}

export function validateOutputSettings(input: unknown): VideoOutputSettings {
  const parsed = outputSettingsSchema.safeParse(input);
  if (!parsed.success) throw invalidSettings();
  if (!isSupportedLanguage(parsed.data.language)) throw invalidSettings();
  assertRenderCombinationSupported(parsed.data);
  return parsed.data;
}

function invalidSettings(): VideoError {
  return new VideoError("video_input_invalid", "The video settings are not supported.");
}
```

```ts
// apps/backend/src/domain/video/render-compatibility.ts
import { VideoError } from "./errors";
import type { VideoAspectRatio, VideoDurationSeconds, VideoResolution } from "./types";

export type RenderCombination = {
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  durationSeconds: VideoDurationSeconds;
};

/**
 * Combinations the HyperFrames spike rendered successfully.
 * Source: docs/decisions/2026-09-21-hyperframes-render-engine.md.
 * Remove any row the record lists under "combinations the MVP must not offer", together with its test row.
 */
export const RENDER_SUPPORTED_COMBINATIONS: readonly RenderCombination[] = [
  { aspectRatio: "9:16", resolution: "720p", durationSeconds: 6 },
  { aspectRatio: "9:16", resolution: "720p", durationSeconds: 10 },
  { aspectRatio: "9:16", resolution: "720p", durationSeconds: 15 },
  { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 6 },
  { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 10 },
  { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 15 },
  { aspectRatio: "1:1", resolution: "720p", durationSeconds: 6 },
  { aspectRatio: "1:1", resolution: "720p", durationSeconds: 10 },
  { aspectRatio: "1:1", resolution: "720p", durationSeconds: 15 },
  { aspectRatio: "1:1", resolution: "1080p", durationSeconds: 6 },
  { aspectRatio: "1:1", resolution: "1080p", durationSeconds: 10 },
  { aspectRatio: "1:1", resolution: "1080p", durationSeconds: 15 },
  { aspectRatio: "16:9", resolution: "720p", durationSeconds: 6 },
  { aspectRatio: "16:9", resolution: "720p", durationSeconds: 10 },
  { aspectRatio: "16:9", resolution: "720p", durationSeconds: 15 },
  { aspectRatio: "16:9", resolution: "1080p", durationSeconds: 6 },
  { aspectRatio: "16:9", resolution: "1080p", durationSeconds: 10 },
  { aspectRatio: "16:9", resolution: "1080p", durationSeconds: 15 },
];

export function isRenderCombinationSupported(combination: RenderCombination): boolean {
  return RENDER_SUPPORTED_COMBINATIONS.some(
    (supported) =>
      supported.aspectRatio === combination.aspectRatio &&
      supported.resolution === combination.resolution &&
      supported.durationSeconds === combination.durationSeconds,
  );
}

export function assertRenderCombinationSupported(combination: RenderCombination): void {
  if (!isRenderCombinationSupported(combination)) {
    throw new VideoError("video_input_invalid", "The video settings are not supported.");
  }
}
```

```ts
// apps/backend/src/domain/video/limits.ts
import { z } from "zod";
import { VideoError } from "./errors";

/** The PRD caps rerenders after the first successful render at three. */
export const MAX_RERENDERS_PER_PROJECT = 3;

/**
 * The PRD leaves the asset count, project byte ceiling, and dimension bounds TBD pending the
 * storage and vision benchmarks. These are the proposed MVP defaults; override per environment.
 */
const limitsSchema = z.object({
  VIDEO_MAX_ASSETS_PER_PROJECT: z.coerce.number().int().positive().default(8),
  VIDEO_MAX_PROJECT_ASSET_BYTES: z.coerce.number().int().positive().default(40 * 1024 * 1024),
  VIDEO_MIN_IMAGE_DIMENSION: z.coerce.number().int().positive().default(200),
  VIDEO_MAX_IMAGE_DIMENSION: z.coerce.number().int().positive().default(8000),
}).strict();

export type AssetLimits = {
  maxAssetsPerProject: number;
  maxProjectAssetBytes: number;
  minImageDimension: number;
  maxImageDimension: number;
};

export function readAssetLimits(environment: Readonly<Record<string, string | undefined>> = process.env): AssetLimits {
  const parsed = limitsSchema.safeParse(pick(environment));
  if (!parsed.success) throw new VideoError("video_input_invalid", "The asset limits are not configured correctly.");
  return {
    maxAssetsPerProject: parsed.data.VIDEO_MAX_ASSETS_PER_PROJECT,
    maxProjectAssetBytes: parsed.data.VIDEO_MAX_PROJECT_ASSET_BYTES,
    minImageDimension: parsed.data.VIDEO_MIN_IMAGE_DIMENSION,
    maxImageDimension: parsed.data.VIDEO_MAX_IMAGE_DIMENSION,
  };
}

function pick(environment: Readonly<Record<string, string | undefined>>) {
  return {
    VIDEO_MAX_ASSETS_PER_PROJECT: environment.VIDEO_MAX_ASSETS_PER_PROJECT,
    VIDEO_MAX_PROJECT_ASSET_BYTES: environment.VIDEO_MAX_PROJECT_ASSET_BYTES,
    VIDEO_MIN_IMAGE_DIMENSION: environment.VIDEO_MIN_IMAGE_DIMENSION,
    VIDEO_MAX_IMAGE_DIMENSION: environment.VIDEO_MAX_IMAGE_DIMENSION,
  };
}
```

- [ ] **Step 5: Implement `state-machine.ts` and verify the state-machine tests GREEN**

```ts
// apps/backend/src/domain/video/state-machine.ts
import { VideoError } from "./errors";
import type { VideoProjectStatus, VideoRenderJobStatus } from "./types";

/**
 * The PRD diagram draws `revision_draft -> rendering`. Story 4 and Story 6 both require explicit
 * approval before any render, so the revision path is realised as
 * `revision_draft -> awaiting_approval -> approved -> rendering`.
 *
 * `rendering -> approved` is the cancellation path: a job cancelled while it is still queued
 * releases the project back to the approved state so the user can render again without spending a
 * rerender. Story 6 forbids any other way back out of `rendering`.
 */
const TRANSITIONS: Record<VideoProjectStatus, readonly VideoProjectStatus[]> = {
  draft: ["interviewing", "moderation_blocked", "failed", "deleted"],
  interviewing: ["awaiting_approval", "moderation_blocked", "failed", "deleted"],
  awaiting_approval: ["interviewing", "approved", "moderation_blocked", "failed", "deleted"],
  approved: ["rendering", "moderation_blocked", "failed", "deleted"],
  rendering: ["ready", "approved", "moderation_blocked", "failed", "deleted"],
  ready: ["revision_draft", "moderation_blocked", "failed", "deleted"],
  revision_draft: ["awaiting_approval", "moderation_blocked", "failed", "deleted"],
  moderation_blocked: ["deleted"],
  failed: ["deleted"],
  deleted: [],
};

const ASSET_EDITABLE_STATUSES: readonly VideoProjectStatus[] = ["draft", "interviewing", "awaiting_approval", "revision_draft"];
const ACTIVE_RENDER_JOB_STATUSES: readonly VideoRenderJobStatus[] = ["queued", "preparing", "rendering", "uploading"];

export function canTransitionVideoProjectStatus(from: VideoProjectStatus, to: VideoProjectStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertVideoProjectTransition(from: VideoProjectStatus, to: VideoProjectStatus): void {
  if (!canTransitionVideoProjectStatus(from, to)) {
    throw new VideoError("video_state_conflict", `The project cannot move from ${from} to ${to}.`);
  }
}

export function canMutateProjectAssets(status: VideoProjectStatus): boolean {
  return ASSET_EDITABLE_STATUSES.includes(status);
}

export function isRenderJobActive(status: VideoRenderJobStatus): boolean {
  return ACTIVE_RENDER_JOB_STATUSES.includes(status);
}
```

Add one test to `state-machine.test.ts` for the cancellation edge, so the extra transition is deliberate rather than accidental:

```ts
  it("lets a cancelled queued job return the project to approved", () => {
    expect(canTransitionVideoProjectStatus("rendering", "approved")).toBe(true);
  });
```

Run: `pnpm --filter backend test -- src/domain/video`

Expected: PASS for all four `domain/video` test files.

- [ ] **Step 6: Implement `contracts.ts`**

Declare only the repository methods Tasks 9–13 call. Every method takes the owner-scoped identifiers explicitly; no repository method is allowed to read or write a row without a `userId`.

```ts
// apps/backend/src/domain/video/contracts.ts
import type { AssetMimeType } from "../ai-service/assets";
import type {
  ProjectAsset, VideoBriefRevision, VideoMessage, VideoOutputSettings, VideoProject,
  VideoProjectStatus, VideoRenderJob, VideoStoryboardRevision, VideoStyleId, VideoType, VideoVersion,
} from "./types";

export type CreateVideoProjectInput = {
  id: string;
  userId: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  settings: VideoOutputSettings;
};

export interface VideoProjectRepository {
  create(input: CreateVideoProjectInput): Promise<VideoProject>;
  /** Excludes soft-deleted rows, so a deleted project reads as not found. */
  getOwned(projectId: string, userId: string): Promise<VideoProject | null>;
  /** Includes soft-deleted rows. Used only by deletion, so a second delete can be idempotent. */
  getOwnedIncludingDeleted(projectId: string, userId: string): Promise<VideoProject | null>;
  listOwned(userId: string): Promise<VideoProject[]>;
  softDelete(projectId: string, userId: string): Promise<void>;
  /** Returns the updated project, or null when the row is not in `expectedStatus`. */
  transition(projectId: string, userId: string, expectedStatus: VideoProjectStatus, nextStatus: VideoProjectStatus): Promise<VideoProject | null>;
  /** Used by the AI orchestration plan when the user changes style through chat before approval. */
  updateStyle(projectId: string, userId: string, styleId: VideoStyleId): Promise<VideoProject | null>;
  /** Increments the rerender counter only while it is below the PRD limit. Returns null when already at the limit. */
  consumeRerender(projectId: string, userId: string): Promise<VideoProject | null>;
}

export type CreateProjectAssetInput = {
  id: string;
  projectId: string;
  userId: string;
  objectKey: string;
  mimeType: AssetMimeType;
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
  rightsConfirmedAt: string;
};

export interface ProjectAssetRepository {
  create(input: CreateProjectAssetInput): Promise<ProjectAsset>;
  getOwned(assetId: string, userId: string): Promise<ProjectAsset | null>;
  listOwned(projectId: string, userId: string): Promise<ProjectAsset[]>;
  sumActiveBytes(projectId: string, userId: string): Promise<number>;
  softDelete(assetId: string, userId: string): Promise<void>;
}

export interface VideoMessageRepository {
  append(input: { id: string; projectId: string; userId: string; role: "user" | "assistant"; content: string; controls?: unknown; assetIds?: string[] }): Promise<VideoMessage>;
  listOwned(projectId: string, userId: string): Promise<VideoMessage[]>;
}

export type CreateBriefRevisionInput = {
  projectId: string;
  userId: string;
  schemaVersion: string;
  brief: unknown;
  isComplete: boolean;
  generatedBy: unknown;
  sourceMessageIds: string[];
};

export interface VideoBriefRevisionRepository {
  create(input: CreateBriefRevisionInput): Promise<VideoBriefRevision>;
  latestOwned(projectId: string, userId: string): Promise<VideoBriefRevision | null>;
  getOwned(revisionId: string, userId: string): Promise<VideoBriefRevision | null>;
}

export type CreateStoryboardRevisionInput = {
  projectId: string;
  userId: string;
  schemaVersion: string;
  briefRevisionId: string;
  scenes: unknown;
  totalDurationSeconds: number;
  generatedBy: unknown;
};

export interface VideoStoryboardRevisionRepository {
  create(input: CreateStoryboardRevisionInput): Promise<VideoStoryboardRevision>;
  latestOwned(projectId: string, userId: string): Promise<VideoStoryboardRevision | null>;
  getOwned(revisionId: string, userId: string): Promise<VideoStoryboardRevision | null>;
  approve(revisionId: string, userId: string, approvedAt: string, approvalSnapshot: unknown): Promise<VideoStoryboardRevision | null>;
}

export type CreateRenderJobInput = {
  id: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  briefRevisionId: string;
  storyboardRevisionId: string;
  parentVersionId?: string;
  isRevision: boolean;
  inputSnapshot: unknown;
};

export interface VideoRenderJobRepository {
  create(input: CreateRenderJobInput): Promise<VideoRenderJob>;
  getOwned(jobId: string, userId: string): Promise<VideoRenderJob | null>;
  /**
   * `getById`, `begin`, and `fail` are worker/queue-facing and take no `userId`: they run without a
   * user session, and the worker only calls them for a job that was already resolved through an
   * owner-scoped path (`create` or `getOwned`). They never discover a job on their own.
   */
  getById(jobId: string): Promise<VideoRenderJob | null>;
  /** Owner filter is part of the query, not the caller's responsibility. */
  findByIdempotencyKey(projectId: string, userId: string, idempotencyKey: string): Promise<VideoRenderJob | null>;
  /** Owner filter is part of the query, not the caller's responsibility. */
  findActiveForProject(projectId: string, userId: string): Promise<VideoRenderJob | null>;
  /** Conditional `queued -> preparing` update that also increments `attempts`. Null when the row was not queued. */
  begin(jobId: string): Promise<VideoRenderJob | null>;
  fail(jobId: string, errorCode: string): Promise<VideoRenderJob | null>;
  cancel(jobId: string, userId: string): Promise<VideoRenderJob | null>;
}

export type CreateVideoVersionInput = {
  projectId: string;
  userId: string;
  versionNumber: number;
  renderJobId: string;
  parentVersionId?: string;
  outputObjectKey: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  manifestHash: string;
};

export interface VideoVersionRepository {
  /** Written by the render plan's worker once an MP4 is uploaded. */
  create(input: CreateVideoVersionInput): Promise<VideoVersion>;
  listOwned(projectId: string, userId: string): Promise<VideoVersion[]>;
  getOwned(versionId: string, userId: string): Promise<VideoVersion | null>;
  latestOwned(projectId: string, userId: string): Promise<VideoVersion | null>;
}
```

- [ ] **Step 7: Verify the whole domain layer GREEN and typecheck**

Run: `pnpm --filter backend test -- src/domain/video`

Run: `pnpm backend:build`

Expected: PASS and no type errors.

- [ ] **Step 8: Commit if authorized**

```bash
git add apps/backend/src/domain/video
git commit -m "feat: add video domain model and project state machine"
```

### Task 8: Brief And Storyboard Schemas With Completeness, Provenance, And Timing Validation

These two files are the contract between the AI orchestration plan (which produces briefs and storyboards) and the approval flow (which refuses to render an incomplete, unsupported, or mistimed one). Both schemas must stay JSON-schema representable — no `.refine`, `.superRefine`, or `.transform` — because the provider adapters call `z.toJSONSchema(..., { unrepresentable: "throw" })` on registered schemas.

**Files:**
- Create: `apps/backend/src/domain/video/brief.ts`
- Create: `apps/backend/src/domain/video/storyboard.ts`
- Test: `apps/backend/src/domain/video/brief.test.ts`
- Test: `apps/backend/src/domain/video/storyboard.test.ts`

**Interfaces:**
- Consumes: `VIDEO_STYLE_IDS`, `outputSettingsSchema` from `./settings`; `VideoType`, `VideoOutputSettings` from `./types`.
- Produces, for Task 12 and the AI orchestration plan: `videoBriefSchema`, `VideoBrief`, `findMissingBriefFields(brief, videoType)`, `findUnsupportedCommercialFacts(brief)`, `BRIEF_SCHEMA_NAME`, `BRIEF_SCHEMA_VERSION`; `storyboardSchema`, `Storyboard`, `StoryboardScene`, `findStoryboardProblems(scenes, settings)`, `storyboardTotalDurationSeconds(scenes)`, `MAX_SCENE_TITLE_CHARS`, `MAX_SCENE_COPY_CHARS`, `STORYBOARD_SCHEMA_NAME`, `STORYBOARD_SCHEMA_VERSION`.

- [ ] **Step 1: Write the failing brief tests**

```ts
import { describe, expect, it } from "vitest";
import { findMissingBriefFields, findUnsupportedCommercialFacts, videoBriefSchema } from "./brief";

const baseBrief = {
  productName: "Kopi Susu Gula Aren",
  productCategory: "Minuman",
  audience: "Mahasiswa dan pekerja kantor di Bandung",
  objective: "Meningkatkan pesanan langsung lewat WhatsApp",
  keyMessage: "Kopi susu gula aren asli, manisnya pas",
  offer: null,
  callToAction: "Pesan sekarang",
  orderDestination: null,
  brandName: "Kopi Bang Aldi",
  styleId: "warm_artisan" as const,
  outputSettings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
  menuItems: null,
  facts: [],
};

describe("video brief", () => {
  it("parses a brief that matches the schema", () => {
    expect(videoBriefSchema.safeParse(baseBrief).success).toBe(true);
  });

  it("rejects an unknown field rather than ignoring it", () => {
    expect(videoBriefSchema.safeParse({ ...baseBrief, discountPercent: 50 }).success).toBe(false);
  });

  it("names the fields a video type still needs", () => {
    expect(findMissingBriefFields(baseBrief, "product_promo")).toEqual([]);
    expect(findMissingBriefFields({ ...baseBrief, callToAction: null }, "product_promo")).toEqual(["callToAction"]);
    expect(findMissingBriefFields({ ...baseBrief, offer: null }, "discount_promo")).toEqual(["offer"]);
    expect(findMissingBriefFields({ ...baseBrief, menuItems: [{ name: "Kopi Susu", price: null }] }, "menu_showcase")).toEqual(["menuItems"]);
  });

  it("flags a price the user never confirmed", () => {
    const brief = {
      ...baseBrief,
      offer: { label: "Promo Mingguan", detail: "Diskon 30%" },
      facts: [],
    };

    expect(findUnsupportedCommercialFacts(brief)).toEqual(["offer.label", "offer.detail"]);
  });

  it("accepts a commercial fact the user confirmed and ignores asset analysis as confirmation", () => {
    const confirmed = {
      ...baseBrief,
      offer: { label: "Promo Mingguan", detail: "Diskon 30%" },
      facts: [
        { field: "offer.label", value: "Promo Mingguan", source: "user_message" as const },
        { field: "offer.detail", value: "Diskon 30%", source: "user_confirmation" as const },
      ],
    };
    const fromImage = {
      ...confirmed,
      facts: confirmed.facts.map((fact) => ({ ...fact, source: "asset_analysis" as const })),
    };

    expect(findUnsupportedCommercialFacts(confirmed)).toEqual([]);
    expect(findUnsupportedCommercialFacts(fromImage)).toEqual(["offer.label", "offer.detail"]);
  });

  it("flags an unconfirmed menu item price but not an unconfirmed item name", () => {
    const brief = {
      ...baseBrief,
      menuItems: [{ name: "Es Teh Manis", price: "Rp 8.000" }, { name: "Kopi Susu", price: null }],
      facts: [],
    };

    expect(findUnsupportedCommercialFacts(brief)).toEqual(["menuItems[0].price"]);
  });
});
```

- [ ] **Step 2: Verify brief RED**

Run: `pnpm --filter backend test -- src/domain/video/brief.test.ts`

Expected: FAIL because `./brief` does not exist.

- [ ] **Step 3: Implement `brief.ts`**

```ts
import { z } from "zod";
import { VIDEO_STYLE_IDS, outputSettingsSchema } from "./settings";
import type { VideoType } from "./types";

export const BRIEF_SCHEMA_NAME = "video_brief";
export const BRIEF_SCHEMA_VERSION = "v1";

const CONFIRMING_SOURCES = ["user_message", "user_confirmation"] as const;

export const videoBriefSchema = z.object({
  productName: z.string().trim().min(1),
  productCategory: z.string().trim().min(1).nullable(),
  audience: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  keyMessage: z.string().trim().min(1),
  offer: z.object({ label: z.string().trim().min(1), detail: z.string().trim().min(1) }).strict().nullable(),
  callToAction: z.string().trim().min(1).nullable(),
  orderDestination: z.string().trim().min(1).nullable(),
  brandName: z.string().trim().min(1).nullable(),
  styleId: z.enum(VIDEO_STYLE_IDS),
  outputSettings: outputSettingsSchema,
  menuItems: z.array(z.object({ name: z.string().trim().min(1), price: z.string().trim().min(1).nullable() }).strict()).nullable(),
  facts: z.array(z.object({ field: z.string().trim().min(1), value: z.string().trim().min(1), source: z.enum(["user_message", "user_confirmation", "asset_analysis"]) }).strict()),
}).strict();

export type VideoBrief = z.infer<typeof videoBriefSchema>;

export type BriefField = "productName" | "audience" | "objective" | "keyMessage" | "offer" | "callToAction" | "menuItems";

const BASE_REQUIRED_FIELDS: readonly BriefField[] = ["productName", "audience", "objective", "keyMessage"];

/** What the interviewer must collect before approval, per video type. */
export const REQUIRED_BRIEF_FIELDS: Record<VideoType, readonly BriefField[]> = {
  product_promo: [...BASE_REQUIRED_FIELDS, "callToAction"],
  discount_promo: [...BASE_REQUIRED_FIELDS, "offer"],
  product_launch: [...BASE_REQUIRED_FIELDS, "callToAction"],
  menu_showcase: [...BASE_REQUIRED_FIELDS, "menuItems"],
};

export function findMissingBriefFields(brief: VideoBrief, videoType: VideoType): readonly BriefField[] {
  return REQUIRED_BRIEF_FIELDS[videoType].filter((field) => !isSatisfied(brief, field));
}

/** Official minimum for a menu showcase: two named items. */
const MIN_MENU_ITEMS = 2;

function isSatisfied(brief: VideoBrief, field: BriefField): boolean {
  if (field === "menuItems") return (brief.menuItems?.length ?? 0) >= MIN_MENU_ITEMS;
  return brief[field] !== null;
}

/**
 * Commercial fields must be traceable to something the user said or confirmed. A value the vision
 * model read off a package is not a confirmation, so `asset_analysis` never clears a commercial field.
 */
export function findUnsupportedCommercialFacts(brief: VideoBrief): readonly string[] {
  const confirmed = new Set(
    brief.facts.filter((fact) => (CONFIRMING_SOURCES as readonly string[]).includes(fact.source)).map((fact) => `${fact.field}=${fact.value}`),
  );
  return commercialFactValues(brief).filter((fact) => !confirmed.has(`${fact.field}=${fact.value}`)).map((fact) => fact.field);
}

export function commercialFactValues(brief: VideoBrief): readonly { field: string; value: string }[] {
  const values: { field: string; value: string }[] = [];
  if (brief.offer) {
    values.push({ field: "offer.label", value: brief.offer.label });
    values.push({ field: "offer.detail", value: brief.offer.detail });
  }
  if (brief.orderDestination) values.push({ field: "orderDestination", value: brief.orderDestination });
  (brief.menuItems ?? []).forEach((item, index) => {
    if (item.price) values.push({ field: `menuItems[${index}].price`, value: item.price });
  });
  return values;
}
```

- [ ] **Step 4: Verify brief GREEN**

Run: `pnpm --filter backend test -- src/domain/video/brief.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing storyboard tests**

```ts
import { describe, expect, it } from "vitest";
import { MAX_SCENE_COPY_CHARS, MAX_SCENE_TITLE_CHARS, findStoryboardProblems, storyboardSchema, storyboardTotalDurationSeconds } from "./storyboard";

const settings = { durationSeconds: 10 as const, aspectRatio: "9:16" as const, resolution: "1080p" as const, language: "id", voiceOverEnabled: true, musicEnabled: true };
const assetId = "22222222-2222-4222-8222-222222222222";

const scene = (overrides: Partial<{ order: number; startSeconds: number; endSeconds: number; voiceOver: string | null; caption: string | null }> = {}) => ({
  order: 1,
  startSeconds: 0,
  endSeconds: 5,
  visual: "Produk di atas meja kayu, cahaya pagi",
  onScreenTitle: "Kopi Susu Gula Aren",
  onScreenCopy: "Manisnya pas, harganya ramah",
  voiceOver: "Coba kopi susu gula aren kami",
  caption: "Coba kopi susu gula aren kami",
  assetIds: [assetId],
  audioCue: "musik lembut",
  transition: "fade" as const,
  ...overrides,
});

const scenes = [scene(), scene({ order: 2, startSeconds: 5, endSeconds: 10, voiceOver: "Pesan sekarang", caption: "Pesan sekarang" })];

describe("storyboard", () => {
  it("parses two contiguous scenes that fill ten seconds", () => {
    expect(storyboardSchema.safeParse({ scenes }).success).toBe(true);
    expect(storyboardTotalDurationSeconds(scenes)).toBe(10);
    expect(findStoryboardProblems(scenes, settings)).toEqual([]);
  });

  it("rejects an unknown scene key and an overlong on-screen title or copy", () => {
    expect(storyboardSchema.safeParse({ scenes: [{ ...scene(), watermark: true }] }).success).toBe(false);
    expect(storyboardSchema.safeParse({ scenes: [scene()] }).success).toBe(true);
    expect(storyboardSchema.safeParse({ scenes: [{ ...scene(), onScreenCopy: "x".repeat(MAX_SCENE_COPY_CHARS + 1) }] }).success).toBe(false);
    expect(storyboardSchema.safeParse({ scenes: [{ ...scene(), onScreenTitle: "x".repeat(MAX_SCENE_TITLE_CHARS + 1) }] }).success).toBe(false);
  });

  it("reports a timeline that does not start at zero, a gap, or a wrong total", () => {
    expect(findStoryboardProblems([scene({ startSeconds: 1, endSeconds: 6 })], settings)).toContain("timeline_start");
    expect(findStoryboardProblems([scene(), scene({ order: 2, startSeconds: 4, endSeconds: 10 })], settings)).toContain("timeline_gap");
    expect(findStoryboardProblems([scene()], settings)).toContain("total_duration_mismatch");
  });

  it("reports a reversed scene and a broken order sequence", () => {
    expect(findStoryboardProblems([scene({ startSeconds: 5, endSeconds: 5 })], settings)).toContain("scene_duration");
    expect(findStoryboardProblems([scene({ order: 3 }), scene({ order: 3, startSeconds: 5, endSeconds: 10 })], settings)).toContain("scene_order");
  });

  it("requires voice-over and captions when voice-over is on, and forbids them when it is off", () => {
    const silent = { ...settings, voiceOverEnabled: false };
    expect(findStoryboardProblems([scene({ voiceOver: null }), scene({ order: 2, startSeconds: 5, endSeconds: 10 })], settings)).toContain("voice_over_missing");
    expect(findStoryboardProblems(scenes, silent)).toContain("voice_over_unexpected");
    expect(findStoryboardProblems([scene({ voiceOver: null, caption: null }), scene({ order: 2, startSeconds: 5, endSeconds: 10, voiceOver: null, caption: null })], silent)).toEqual([]);
  });

  it("requires every scene to reference an asset", () => {
    expect(findStoryboardProblems([{ ...scene(), assetIds: [] }, scene({ order: 2, startSeconds: 5, endSeconds: 10 })], settings)).toContain("asset_reference_missing");
  });
});
```

- [ ] **Step 6: Verify storyboard RED**

Run: `pnpm --filter backend test -- src/domain/video/storyboard.test.ts`

Expected: FAIL because `./storyboard` does not exist.

- [ ] **Step 7: Implement `storyboard.ts`**

```ts
import { z } from "zod";
import type { VideoOutputSettings } from "./types";

export const STORYBOARD_SCHEMA_NAME = "video_storyboard";
export const STORYBOARD_SCHEMA_VERSION = "v1";

/** Design-system safe-area limits for on-screen text at the smallest supported resolution. */
export const MAX_SCENE_TITLE_CHARS = 40;
export const MAX_SCENE_COPY_CHARS = 90;

export const storyboardSceneSchema = z.object({
  order: z.number().int().positive(),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  visual: z.string().trim().min(1).max(300),
  onScreenTitle: z.string().trim().min(1).max(MAX_SCENE_TITLE_CHARS),
  onScreenCopy: z.string().trim().min(1).max(MAX_SCENE_COPY_CHARS),
  voiceOver: z.string().trim().min(1).nullable(),
  caption: z.string().trim().min(1).nullable(),
  assetIds: z.array(z.string().uuid()),
  audioCue: z.string().trim().min(1).nullable(),
  transition: z.enum(["cut", "fade", "slide", "zoom"]),
}).strict();

export const storyboardSchema = z.object({ scenes: z.array(storyboardSceneSchema).min(1) }).strict();

export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;

export type StoryboardProblem =
  | "timeline_start"
  | "scene_duration"
  | "scene_order"
  | "timeline_gap"
  | "total_duration_mismatch"
  | "voice_over_missing"
  | "voice_over_unexpected"
  | "asset_reference_missing";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function storyboardTotalDurationSeconds(scenes: readonly StoryboardScene[]): number {
  return round(scenes.reduce((total, scene) => total + (scene.endSeconds - scene.startSeconds), 0));
}

/**
 * Every rule the renderer cannot recover from on its own. The AI orchestration layer calls this
 * before showing a storyboard, and approval calls it again before freezing a snapshot, so a
 * storyboard that slipped through the first check can never reach an approved job.
 */
export function findStoryboardProblems(scenes: readonly StoryboardScene[], settings: VideoOutputSettings): readonly StoryboardProblem[] {
  const problems = new Set<StoryboardProblem>();
  const ordered = [...scenes].sort((left, right) => left.order - right.order);

  if (ordered.length > 0 && ordered[0]?.startSeconds !== 0) problems.add("timeline_start");

  ordered.forEach((scene, index) => {
    if (scene.endSeconds <= scene.startSeconds) problems.add("scene_duration");
    if (scene.order !== index + 1) problems.add("scene_order");
    if (scene.assetIds.length === 0) problems.add("asset_reference_missing");
    const hasVoiceOver = scene.voiceOver !== null || scene.caption !== null;
    if (settings.voiceOverEnabled && (scene.voiceOver === null || scene.caption === null)) problems.add("voice_over_missing");
    if (!settings.voiceOverEnabled && hasVoiceOver) problems.add("voice_over_unexpected");

    const previous = ordered[index - 1];
    if (previous && previous.endSeconds !== scene.startSeconds) problems.add("timeline_gap");
  });

  if (storyboardTotalDurationSeconds(ordered) !== settings.durationSeconds) problems.add("total_duration_mismatch");

  return [...problems];
}
```

- [ ] **Step 8: Verify storyboard GREEN, then the whole domain layer**

Run: `pnpm --filter backend test -- src/domain/video`

Expected: PASS.

- [ ] **Step 9: Commit if authorized**

```bash
git add apps/backend/src/domain/video
git commit -m "feat: validate video briefs and storyboards"
```

### Task 9: Projects API

**Files:**
- Create: `apps/backend/src/application/video/projects.ts`
- Create: `apps/backend/src/application/video/services.ts`
- Create: `apps/backend/src/infrastructure/video/supabase-video-project-repository.ts`
- Create: `apps/backend/src/infrastructure/video/supabase-project-asset-repository.ts` (adds only `listOwned` and `softDelete`; Task 10 completes it)
- Create: `apps/backend/src/infrastructure/video/supabase-version-repository.ts` (adds only `listOwned`; Task 13 completes it)
- Create: `apps/backend/src/schemas/video.ts`
- Create: `apps/backend/src/routes/video.ts`
- Create: `apps/backend/src/application/video/projects.test.ts`
- Create: `apps/backend/src/infrastructure/video/supabase-video-project-repository.test.ts`
- Create: `apps/backend/src/schemas/video.test.ts`
- Create: `apps/backend/src/routes/video.test.ts`
- Modify: `apps/backend/src/app.ts`
- Modify: `apps/backend/src/plugins/errors.ts`
- Modify: `apps/backend/src/domain/video/contracts.ts` (add `getOwnedIncludingDeleted` to `VideoProjectRepository`)

**Interfaces:**
- Consumes: `VideoProjectRepository`, `VideoProject`, `validateOutputSettings`, `assertVideoProjectTransition`, `VideoError`, `AssetObjectStore`, `createSupabaseServiceRoleClient`.
- Produces: `videoProjectRoutes` mounted at `/video-projects`; `createVideoProject`, `listVideoProjects`, `getVideoProject`, `deleteVideoProject`, `toProjectResponse`; `createVideoProjectServices()`; `createVideoProjectBodySchema`; and the `VideoError` mapping in the global error plugin that Tasks 10–13 reuse.

Every route body is validated with `.strict()`, so a client that sends `user_id`, `status`, or any other key it does not own gets a `422` instead of having the value ignored.

- [ ] **Step 1: Write the failing use-case tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createVideoProject, deleteVideoProject, getVideoProject, listVideoProjects } from "./projects";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const settings = { durationSeconds: 6 as const, aspectRatio: "9:16" as const, resolution: "720p" as const, language: "id", voiceOverEnabled: true, musicEnabled: true };

function project(overrides = {}) {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo" as const, styleId: "bold_pop" as const, status: "draft" as const, settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated", ...overrides };
}

function dependencies() {
  return {
    createId: () => PROJECT_ID,
    projects: {
      create: vi.fn(async (input) => project(input)),
      getOwned: vi.fn(async () => project()),
      getOwnedIncludingDeleted: vi.fn(async () => project()),
      listOwned: vi.fn(async () => [project()]),
      softDelete: vi.fn(async () => undefined),
      transition: vi.fn(async () => project()),
      updateStyle: vi.fn(async () => project()),
      consumeRerender: vi.fn(async () => project()),
    },
    assets: { listOwned: vi.fn(async () => [{ id: "asset-1", objectKey: "video-projects/p/a.png" }]), softDelete: vi.fn(async () => undefined) },
    versions: { listOwned: vi.fn(async () => [{ id: "v1", outputObjectKey: "video-versions/p/v1.mp4" }]) },
    objectStore: { write: vi.fn(), read: vi.fn(), delete: vi.fn() },
  };
}

describe("createVideoProject", () => {
  it("derives ownership from the caller and starts in draft", async () => {
    const deps = dependencies();

    await createVideoProject({ userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", settings }, deps);

    expect(deps.projects.create).toHaveBeenCalledWith({ id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", settings });
  });

  it("rejects settings the render engine never verified", async () => {
    const deps = dependencies();

    await expect(createVideoProject({ userId: USER_ID, title: "Promo", videoType: "product_promo", styleId: "bold_pop", settings: { ...settings, durationSeconds: 7 as never } }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.projects.create).not.toHaveBeenCalled();
  });

  it("rejects an empty or overlong title", async () => {
    const deps = dependencies();

    await expect(createVideoProject({ userId: USER_ID, title: "   ", videoType: "product_promo", styleId: "bold_pop", settings }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    await expect(createVideoProject({ userId: USER_ID, title: "x".repeat(121), videoType: "product_promo", styleId: "bold_pop", settings }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });
});

describe("getVideoProject", () => {
  it("hides another user's project behind a not-found error", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);

    await expect(getVideoProject(PROJECT_ID, "user-b", deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });
});

describe("deleteVideoProject", () => {
  it("soft deletes the project and every asset before removing objects", async () => {
    const deps = dependencies();

    await deleteVideoProject(PROJECT_ID, USER_ID, deps);

    expect(deps.projects.softDelete).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    expect(deps.assets.softDelete).toHaveBeenCalledWith("asset-1", USER_ID);
    expect(deps.objectStore.delete.mock.calls).toEqual([["video-projects/p/a.png"], ["video-versions/p/v1.mp4"]]);
  });

  it("is idempotent on a second call and reports how many objects are still pending", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);
    deps.projects.getOwnedIncludingDeleted.mockResolvedValue(project({ status: "deleted", deletedAt: "deleted" }));

    await expect(deleteVideoProject(PROJECT_ID, USER_ID, deps)).resolves.toEqual({ pendingObjectDeletions: 0 });
    expect(deps.projects.softDelete).not.toHaveBeenCalled();
  });

  it("still hides a project the caller does not own", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);
    deps.projects.getOwnedIncludingDeleted.mockResolvedValue(null);

    await expect(deleteVideoProject(PROJECT_ID, "user-b", deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });

  it("succeeds with the rows deleted when object cleanup fails", async () => {
    const deps = dependencies();
    deps.objectStore.delete.mockRejectedValue(new Error("storage unavailable"));

    await expect(deleteVideoProject(PROJECT_ID, USER_ID, deps)).resolves.toEqual({ pendingObjectDeletions: 2 });
  });
});

describe("listVideoProjects", () => {
  it("scopes the query to the caller", async () => {
    const deps = dependencies();

    await listVideoProjects(USER_ID, deps);

    expect(deps.projects.listOwned).toHaveBeenCalledWith(USER_ID);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/application/video/projects.test.ts`

Expected: FAIL because `./projects` does not exist.

- [ ] **Step 3: Implement `application/video/projects.ts`**

```ts
import { VideoError } from "../../domain/video/errors";
import { validateOutputSettings } from "../../domain/video/settings";
import type {
  ProjectAssetRepository, VideoProjectRepository, VideoVersionRepository,
} from "../../domain/video/contracts";
import type { AssetObjectStore } from "../../domain/ai-service/assets";
import type { VideoOutputSettings, VideoProject, VideoStyleId, VideoType } from "../../domain/video/types";

const MAX_TITLE_LENGTH = 120;

export type ProjectDependencies = {
  projects: VideoProjectRepository;
  assets: Pick<ProjectAssetRepository, "listOwned" | "softDelete">;
  versions: Pick<VideoVersionRepository, "listOwned">;
  objectStore: AssetObjectStore;
  createId: () => string;
};

export type CreateVideoProjectCommand = {
  userId: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  settings: VideoOutputSettings;
};

export async function createVideoProject(command: CreateVideoProjectCommand, dependencies: ProjectDependencies): Promise<VideoProject> {
  const title = command.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) throw invalidInput("The project title is required.");
  const settings = validateOutputSettings(command.settings);

  return dependencies.projects.create({
    id: dependencies.createId(),
    userId: command.userId,
    title,
    videoType: command.videoType,
    styleId: command.styleId,
    settings,
  });
}

export async function listVideoProjects(userId: string, dependencies: ProjectDependencies): Promise<VideoProject[]> {
  return dependencies.projects.listOwned(userId);
}

export async function getVideoProject(projectId: string, userId: string, dependencies: ProjectDependencies): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project) throw projectNotFound();
  return project;
}

/**
 * Soft deletes rows first, then removes objects best effort. A storage outage must not leave the
 * project readable, so the remaining object count is returned instead of failing the request; the
 * rows keep their `deleted_at`, which is what a later reconciliation pass keys off.
 */
export async function deleteVideoProject(projectId: string, userId: string, dependencies: ProjectDependencies): Promise<{ pendingObjectDeletions: number }> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project) {
    const existing = await dependencies.projects.getOwnedIncludingDeleted(projectId, userId);
    if (!existing || existing.status !== "deleted") throw projectNotFound();
    return { pendingObjectDeletions: 0 };
  }

  const [assets, versions] = await Promise.all([
    dependencies.assets.listOwned(projectId, userId),
    dependencies.versions.listOwned(projectId, userId),
  ]);

  await dependencies.projects.softDelete(projectId, userId);
  for (const asset of assets) await dependencies.assets.softDelete(asset.id, userId);

  const objectKeys = [...assets.map((asset) => asset.objectKey), ...versions.map((version) => version.outputObjectKey)];
  const results = await Promise.allSettled(objectKeys.map((key) => dependencies.objectStore.delete(key)));

  return { pendingObjectDeletions: results.filter((result) => result.status === "rejected").length };
}

export type ProjectResponse = {
  id: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  status: VideoProject["status"];
  settings: VideoOutputSettings;
  revisionRenderCount: number;
  createdAt: string;
  updatedAt: string;
};

/** The only shape a project is allowed to leave the backend in: no user id, no object keys. */
export function toProjectResponse(project: VideoProject): ProjectResponse {
  return {
    id: project.id,
    title: project.title,
    videoType: project.videoType,
    styleId: project.styleId,
    status: project.status,
    settings: project.settings,
    revisionRenderCount: project.revisionRenderCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function invalidInput(message: string): VideoError {
  return new VideoError("video_input_invalid", message);
}

function projectNotFound(): VideoError {
  return new VideoError("video_project_not_found", "The video project was not found.");
}
```

`toProjectResponse` is the only shape a project leaves the backend in. Task 11 reuses it for the message response, Task 12 for the approval response, and Task 13 for the render-job response, so every one of them reports the same project fields.

- [ ] **Step 4: Verify the use-case tests GREEN**

Run: `pnpm --filter backend test -- src/application/video/projects.test.ts`

Expected: PASS. Note the last test in `deleteVideoProject` expects `pendingObjectDeletions: 2` — two objects, both failing.

- [ ] **Step 5: Write the failing repository tests**

Mock the Supabase client with the call-recording style already used in `supabase-asset-repository.test.ts` and `supabase-usage-recorder.test.ts`.

```ts
import { describe, expect, it, vi } from "vitest";
import { SupabaseVideoProjectRepository } from "./supabase-video-project-repository";

const ROW = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: "11111111-1111-4111-8111-111111111111",
  title: "Promo Kopi",
  video_type: "product_promo",
  style_id: "bold_pop",
  duration_seconds: 6,
  aspect_ratio: "9:16",
  resolution: "720p",
  language: "id",
  voice_over_enabled: true,
  music_enabled: true,
  status: "draft",
  revision_render_count: 0,
  deleted_at: null,
  created_at: "2026-09-21T00:00:00.000Z",
  updated_at: "2026-09-21T00:00:00.000Z",
};

function makeClient(result: unknown = ROW) {
  const calls: Array<{ operation: string; value?: unknown; filters: Array<[string, unknown]> }> = [];
  const client = {
    calls,
    from: vi.fn((table: string) => chain(table, result, calls)),
  };
  return { client, calls };
}

describe("SupabaseVideoProjectRepository", () => {
  it("qualifies every read by owner and hides soft-deleted rows", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseVideoProjectRepository(client as never);

    await repository.getOwned(ROW.id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["deleted_at", null]);
  });

  it("scopes a transition to the expected current status", async () => {
    const { client, calls } = makeClient({ ...ROW, status: "approved" });
    const repository = new SupabaseVideoProjectRepository(client as never);

    await repository.transition(ROW.id, ROW.user_id, "approved", "rendering");

    expect(calls[0]).toMatchObject({ operation: "update", value: { status: "rendering" } });
    expect(calls[0]?.filters).toContainEqual(["status", "approved"]);
  });

  it("returns null when a transition matched no row", async () => {
    const { client } = makeClient(null);
    const repository = new SupabaseVideoProjectRepository(client as never);

    await expect(repository.transition(ROW.id, ROW.user_id, "approved", "rendering")).resolves.toBeNull();
  });

  it("only consumes a rerender while the counter is below the PRD limit", async () => {
    const { client, calls } = makeClient({ ...ROW, revision_render_count: 1 });
    const repository = new SupabaseVideoProjectRepository(client as never);

    await repository.consumeRerender(ROW.id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["revision_render_count", "<", 3]);
  });
});
```

`makeClient` builds the same chainable stub shape as the existing repository tests: `from(table)` returns an object whose `select`/`update`/`insert`/`eq`/`is`/`lt`/`order`/`maybeSingle`/`single` methods record the call and eventually resolve `{ data: result, error: null }`. Copy the recorder implementation from `supabase-asset-repository.test.ts` rather than inventing a second one.

- [ ] **Step 6: Verify RED, then implement the repository**

Run: `pnpm --filter backend test -- src/infrastructure/video/supabase-video-project-repository.test.ts`

Expected: FAIL because the repository does not exist.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_RERENDERS_PER_PROJECT } from "../../domain/video/limits";
import type { CreateVideoProjectInput, VideoProjectRepository } from "../../domain/video/contracts";
import type { VideoProject, VideoProjectStatus, VideoStyleId } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type ProjectRow = Database["public"]["Tables"]["video_projects"]["Row"];

export class SupabaseVideoProjectRepository implements VideoProjectRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateVideoProjectInput): Promise<VideoProject> {
    const { data, error } = await this.supabase.from("video_projects").insert({
      id: input.id,
      user_id: input.userId,
      title: input.title,
      video_type: input.videoType,
      style_id: input.styleId,
      duration_seconds: input.settings.durationSeconds,
      aspect_ratio: input.settings.aspectRatio,
      resolution: input.settings.resolution,
      language: input.settings.language,
      voice_over_enabled: input.settings.voiceOverEnabled,
      music_enabled: input.settings.musicEnabled,
    }).select("*").single();
    if (error) throw error;
    return mapProject(data);
  }

  async getOwned(projectId: string, userId: string): Promise<VideoProject | null> {
    const { data, error } = await this.supabase.from("video_projects").select("*")
      .eq("id", projectId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async getOwnedIncludingDeleted(projectId: string, userId: string): Promise<VideoProject | null> {
    const { data, error } = await this.supabase.from("video_projects").select("*")
      .eq("id", projectId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async listOwned(userId: string): Promise<VideoProject[]> {
    const { data, error } = await this.supabase.from("video_projects").select("*")
      .eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapProject);
  }

  async softDelete(projectId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.from("video_projects")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", projectId).eq("user_id", userId).is("deleted_at", null);
    if (error) throw error;
  }

  async transition(projectId: string, userId: string, expectedStatus: VideoProjectStatus, nextStatus: VideoProjectStatus): Promise<VideoProject | null> {
    const { data, error } = await this.supabase.from("video_projects")
      .update({ status: nextStatus })
      .eq("id", projectId).eq("user_id", userId).eq("status", expectedStatus)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async updateStyle(projectId: string, userId: string, styleId: VideoStyleId): Promise<VideoProject | null> {
    const { data, error } = await this.supabase.from("video_projects")
      .update({ style_id: styleId })
      .eq("id", projectId).eq("user_id", userId)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async consumeRerender(projectId: string, userId: string): Promise<VideoProject | null> {
    const current = await this.getOwned(projectId, userId);
    if (!current || current.revisionRenderCount >= MAX_RERENDERS_PER_PROJECT) return null;
    const { data, error } = await this.supabase.from("video_projects")
      .update({ revision_render_count: current.revisionRenderCount + 1 })
      .eq("id", projectId).eq("user_id", userId).lt("revision_render_count", MAX_RERENDERS_PER_PROJECT)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }
}

export function mapProject(row: ProjectRow): VideoProject {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    videoType: row.video_type,
    styleId: row.style_id,
    status: row.status,
    settings: {
      durationSeconds: row.duration_seconds,
      aspectRatio: row.aspect_ratio,
      resolution: row.resolution,
      language: row.language,
      voiceOverEnabled: row.voice_over_enabled,
      musicEnabled: row.music_enabled,
    },
    revisionRenderCount: row.revision_render_count,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

The `lt("revision_render_count", MAX_RERENDERS_PER_PROJECT)` guard is what makes the counter safe under concurrency: the read before it is only an early exit, and the write itself cannot exceed the limit.

- [ ] **Step 7: Verify the repository GREEN**

Run: `pnpm --filter backend test -- src/infrastructure/video/supabase-video-project-repository.test.ts`

Expected: PASS.

- [ ] **Step 8: Write the failing schema and route tests**

```ts
// src/schemas/video.test.ts
import { describe, expect, it } from "vitest";
import { createVideoProjectBodySchema } from "./video";

const body = {
  title: "Promo Kopi",
  videoType: "product_promo",
  styleId: "bold_pop",
  settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true },
};

describe("createVideoProjectBodySchema", () => {
  it("accepts the documented body", () => {
    expect(createVideoProjectBodySchema.safeParse(body).success).toBe(true);
  });

  it("rejects a client-supplied owner, status, or id instead of ignoring it", () => {
    for (const extra of [{ user_id: "someone" }, { userId: "someone" }, { status: "approved" }, { id: "11111111-1111-4111-8111-111111111111" }, { revision_render_count: 0 }]) {
      expect(createVideoProjectBodySchema.safeParse({ ...body, ...extra }).success).toBe(false);
    }
  });

  it("rejects extra keys inside settings too", () => {
    expect(createVideoProjectBodySchema.safeParse({ ...body, settings: { ...body.settings, watermark: false } }).success).toBe(false);
  });

  it("rejects a settings payload that omits a required toggle", () => {
    const { musicEnabled, ...incomplete } = body.settings;
    expect(createVideoProjectBodySchema.safeParse({ ...body, settings: incomplete }).success).toBe(false);
  });
});
```

```ts
// src/routes/video.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  publicClient: vi.fn(),
  userClient: vi.fn(),
  createVideoProject: vi.fn(),
  listVideoProjects: vi.fn(),
  getVideoProject: vi.fn(),
  deleteVideoProject: vi.fn(),
  services: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({ createSupabasePublicClient: mocks.publicClient, createSupabaseUserClient: mocks.userClient, createSupabaseServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/application/video/services", () => ({ createVideoProjectServices: mocks.services }));
vi.mock("@/application/video/projects", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/projects")>("@/application/video/projects");
  return { ...actual, createVideoProject: mocks.createVideoProject, listVideoProjects: mocks.listVideoProjects, getVideoProject: mocks.getVideoProject, deleteVideoProject: mocks.deleteVideoProject };
});

import { VideoError } from "@/domain/video/errors";
import { createApp } from "@/app";

const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
const project = { id: "33333333-3333-4333-8333-333333333333", title: "Promo", videoType: "product_promo", styleId: "bold_pop", status: "draft", settings: {}, revisionRenderCount: 0, createdAt: "c", updatedAt: "u" };

function send(method: string, path: string, options: { token?: string; body?: unknown } = {}) {
  return createApp().handle(new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  }));
}

describe("video project routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.services.mockReturnValue({});
    mocks.createVideoProject.mockResolvedValue(project);
    mocks.listVideoProjects.mockResolvedValue([project]);
    mocks.getVideoProject.mockResolvedValue(project);
    mocks.deleteVideoProject.mockResolvedValue({ pendingObjectDeletions: 0 });
  });

  it("requires authentication on every route", async () => {
    for (const [method, path] of [["POST", "/video-projects"], ["GET", "/video-projects"], ["GET", `/video-projects/${project.id}`], ["DELETE", `/video-projects/${project.id}`]] as const) {
      expect((await send(method, path)).status).toBe(401);
    }
    expect(mocks.createVideoProject).not.toHaveBeenCalled();
  });

  it("creates a project scoped to the authenticated user and answers 201", async () => {
    const response = await send("POST", "/video-projects", { token: "token", body: { title: "Promo", videoType: "product_promo", styleId: "bold_pop", settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true } } });

    expect(response.status).toBe(201);
    expect(mocks.createVideoProject).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), expect.anything());
    await expect(response.json()).resolves.toEqual({ project });
  });

  it("rejects a body that carries a client-owned field", async () => {
    const response = await send("POST", "/video-projects", { token: "token", body: { title: "Promo", videoType: "product_promo", styleId: "bold_pop", status: "approved", settings: {} } });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.createVideoProject).not.toHaveBeenCalled();
  });

  it("maps a domain not-found to 404 without leaking database text", async () => {
    mocks.getVideoProject.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("GET", `/video-projects/${project.id}`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });

  it("maps a state conflict to 409", async () => {
    mocks.deleteVideoProject.mockRejectedValue(new VideoError("video_state_conflict", "The project cannot move from ready to interviewing."));

    expect((await send("DELETE", `/video-projects/${project.id}`, { token: "token" })).status).toBe(409);
  });
});
```

- [ ] **Step 9: Verify RED, then implement the schemas, error mapping, routes, and factory**

Run: `pnpm --filter backend test -- src/schemas/video.test.ts src/routes/video.test.ts`

Expected: FAIL because the schema, route file, and error mapping do not exist.

```ts
// apps/backend/src/schemas/video.ts
import { z } from "zod";
import { VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS_SECONDS, VIDEO_RESOLUTIONS, VIDEO_STYLE_IDS, VIDEO_TYPES } from "@/domain/video/settings";

export const outputSettingsBodySchema = z.object({
  durationSeconds: z.union([z.literal(6), z.literal(10), z.literal(15)]),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  language: z.string().trim().min(2).max(12),
  voiceOverEnabled: z.boolean(),
  musicEnabled: z.boolean(),
}).strict();

export const createVideoProjectBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  videoType: z.enum(VIDEO_TYPES),
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsBodySchema,
}).strict();

export type CreateVideoProjectBody = z.infer<typeof createVideoProjectBodySchema>;
```

`outputSettingsBodySchema` is shared by Tasks 11–13 for message and approval bodies. `durationSeconds` is a union of literals rather than a coerced enum: the route test posts the numeric `6`, and a string-enum-plus-coerce form rejects it.

In `apps/backend/src/plugins/errors.ts`, import `VideoError` and `VideoErrorCode`, add the status table, and map it before the billing branch:

```ts
const videoErrorStatus: Record<VideoErrorCode, number> = {
  video_project_not_found: 404,
  video_render_job_not_found: 404,
  video_version_not_found: 404,
  video_input_invalid: 422,
  video_asset_invalid: 422,
  video_asset_limit_reached: 422,
  video_state_conflict: 409,
  video_approval_incomplete: 409,
  video_revision_quota_exhausted: 409,
};

// inside mapDomainError, alongside the AIError branch:
  if (error instanceof VideoError) {
    return { status: videoErrorStatus[error.code], body: { error: error.message, code: error.code } };
  }
```

```ts
// apps/backend/src/routes/video.ts
import { Elysia, t } from "elysia";
import { createVideoProject, deleteVideoProject, getVideoProject, listVideoProjects, toProjectResponse } from "@/application/video/projects";
import { createVideoProjectServices } from "@/application/video/services";
import { authPlugin } from "@/plugins/supabase";
import { createVideoProjectBodySchema } from "@/schemas/video";

const invalidRequest = { error: "Invalid request." } as const;
const jsonBody = { body: t.Unknown() } as const;

export const videoProjectRoutes = new Elysia({ name: "video-project-routes" })
  .use(authPlugin)
  .post(
    "/video-projects",
    async ({ body, status, user, set }) => {
      const parsed = createVideoProjectBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const project = await createVideoProject({ userId: user.id, ...parsed.data }, createVideoProjectServices());
      set.status = 201;
      return { project: toProjectResponse(project) };
    },
    { auth: true, ...jsonBody, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects",
    async ({ user }) => {
      const projects = await listVideoProjects(user.id, createVideoProjectServices());
      return { projects: projects.map(toProjectResponse) };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId",
    async ({ params, user }) => {
      const project = await getVideoProject(params.projectId, user.id, createVideoProjectServices());
      return { project: toProjectResponse(project) };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
  .delete(
    "/video-projects/:projectId",
    async ({ params, user }) => deleteVideoProject(params.projectId, user.id, createVideoProjectServices()),
    { auth: true, detail: { tags: ["video"] } },
  );
```

`parsed.data.settings.durationSeconds` arrives as a number, matching `VideoOutputSettings`, so it can be spread straight into the command. Confirm that in the route test — if the schema yields a string, convert it in the route with `Number(...)` rather than loosening the domain types.

```ts
// apps/backend/src/application/video/services.ts
import { createSupabaseServiceRoleClient } from "../../infrastructure/supabase/clients";
import { SupabaseAssetObjectStore, readAssetBucket } from "../../infrastructure/ai-service/supabase-asset-object-store";
import { SupabaseVideoProjectRepository } from "../../infrastructure/video/supabase-video-project-repository";
import { readAssetLimits } from "../../domain/video/limits";
import type { ProjectDependencies } from "./projects";

/** The single place the video application layer is allowed to construct infrastructure. */
export function createVideoProjectServices(environment: Readonly<Record<string, string | undefined>> = process.env): ProjectDependencies & { limits: ReturnType<typeof readAssetLimits> } {
  const supabase = createSupabaseServiceRoleClient(environment);

  return {
    projects: new SupabaseVideoProjectRepository(supabase),
    assets: new SupabaseProjectAssetRepository(supabase),
    versions: new SupabaseVideoVersionRepository(supabase),
    objectStore: new SupabaseAssetObjectStore(supabase, readAssetBucket(environment)),
    limits: readAssetLimits(environment),
    createId: () => crypto.randomUUID(),
  };
}
```

`SupabaseProjectAssetRepository` and `SupabaseVideoVersionRepository` are added to this factory by Tasks 10 and 13; create them in those tasks and add the imports then. The route tests mock this module, so they pass from this step onwards.

Finish by mounting the routes in `apps/backend/src/app.ts`: import `videoProjectRoutes` and add `.use(videoProjectRoutes)` after `.use(aiRoutes)`.

- [ ] **Step 10: Verify GREEN**

Run: `pnpm --filter backend test -- src/schemas/video.test.ts src/routes/video.test.ts src/application/video/projects.test.ts src/infrastructure/video/supabase-video-project-repository.test.ts`

Expected: PASS.

- [ ] **Step 11: Commit if authorized**

```bash
git add apps/backend/src/application/video apps/backend/src/infrastructure/video apps/backend/src/schemas/video.ts apps/backend/src/routes/video.ts apps/backend/src/routes/video.test.ts apps/backend/src/app.ts apps/backend/src/plugins/errors.ts apps/backend/src/domain/video/contracts.ts
git commit -m "feat: add video project api"
```

### Task 10: Project Asset API

**Files:**
- Create: `apps/backend/src/application/video/assets.ts`
- Modify: `apps/backend/src/infrastructure/video/supabase-project-asset-repository.ts` (created by Task 9 with `listOwned`/`softDelete`; add `create`, `getOwned`, and `sumActiveBytes`)
- Create: `apps/backend/src/infrastructure/video/supabase-signed-urls.ts`
- Create: `apps/backend/src/application/video/assets.test.ts`
- Create: `apps/backend/src/infrastructure/video/supabase-project-asset-repository.test.ts`
- Modify: `apps/backend/src/application/video/services.ts`
- Modify: `apps/backend/src/schemas/video.ts`
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`

**Interfaces:**
- Consumes: `validateImage`, `sha256`, `MAX_ASSET_BYTES` from `../ai-service/register-asset` and `../../domain/ai-service/assets`; `readAssetLimits`, `canMutateProjectAssets`; `AssetResolver` from `../../domain/ai-service/contracts`.
- Produces: `registerProjectAsset`, `deleteProjectAsset`, `listProjectAssets`, `assertProjectActive`, `class ProjectAssetResolver implements AssetResolver`, `createSupabaseSignedUrlFactory`, `export const SIGNED_URL_TTL_SECONDS = 300`; routes `POST|GET /video-projects/:projectId/assets` and `DELETE /video-projects/:projectId/assets/:assetId`.

Object keys are `video-projects/<projectId>/<assetId>.<jpg|png|webp>`. File names supplied by the user are never used in a key.

- [ ] **Step 1: Write the failing asset-use-case tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { registerProjectAsset, deleteProjectAsset, listProjectAssets } from "./assets";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));

function dependencies(overrides: { status?: string; existingAssets?: unknown[] } = {}) {
  return {
    createId: () => ASSET_ID,
    limits: { maxAssetsPerProject: 2, maxProjectAssetBytes: 1024, minImageDimension: 1, maxImageDimension: 8000 },
    projects: { getOwned: vi.fn(async () => ({ id: PROJECT_ID, status: overrides.status ?? "interviewing" })) },
    assets: {
      create: vi.fn(async (input) => ({ ...input, moderationStatus: "pending", createdAt: "created" })),
      getOwned: vi.fn(async () => ({ id: ASSET_ID, projectId: PROJECT_ID, objectKey: `video-projects/${PROJECT_ID}/${ASSET_ID}.png`, mimeType: "image/png", byteSize: PNG.length, sha256: "hash", width: 2, height: 3, moderationStatus: "pending" })),
      listOwned: vi.fn(async () => overrides.existingAssets ?? []),
      sumActiveBytes: vi.fn(async () => 0),
      softDelete: vi.fn(async () => undefined),
    },
    objectStore: { write: vi.fn(), read: vi.fn(), delete: vi.fn() },
  };
}

describe("registerProjectAsset", () => {
  it("writes the object before the row and returns the asset", async () => {
    const deps = dependencies();

    const asset = await registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps);

    expect(deps.objectStore.write).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`, PNG, "image/png");
    expect(asset.mimeType).toBe("image/png");
  });

  it("refuses an upload without a rights confirmation", async () => {
    const deps = dependencies();

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: false }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.objectStore.write).not.toHaveBeenCalled();
  });

  it("validates the real bytes rather than the declared type", async () => {
    const deps = dependencies();

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: Uint8Array.from([71, 73, 70, 56, 57, 97]), declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toMatchObject({ code: "video_asset_invalid" });
    expect(deps.objectStore.write).not.toHaveBeenCalled();
  });

  it("refuses an asset once the project is no longer editable", async () => {
    const deps = dependencies({ status: "rendering" });

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toMatchObject({ code: "video_state_conflict" });
  });

  it("refuses an upload into a project that was deleted while the request was in flight", async () => {
    const deps = dependencies();
    deps.projects.getOwned
      .mockResolvedValueOnce({ id: PROJECT_ID, status: "interviewing" })
      .mockResolvedValueOnce(null);

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toMatchObject({ code: "video_project_not_found" });
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
  });

  it("enforces the configured asset count and byte ceiling", async () => {
    const full = dependencies({ existingAssets: [{ id: "a" }, { id: "b" }] });
    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, full))
      .rejects.toMatchObject({ code: "video_asset_limit_reached" });

    const heavy = dependencies();
    heavy.assets.sumActiveBytes.mockResolvedValue(1024);
    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, heavy))
      .rejects.toMatchObject({ code: "video_asset_limit_reached" });
  });

  it("deletes the object when the row insert fails", async () => {
    const deps = dependencies();
    deps.assets.create.mockRejectedValue(new Error("insert failed"));

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toThrowError("insert failed");
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
  });
});

describe("deleteProjectAsset", () => {
  it("soft deletes the row and then the object", async () => {
    const deps = dependencies();

    await deleteProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, assetId: ASSET_ID }, deps);

    expect(deps.assets.softDelete).toHaveBeenCalledWith(ASSET_ID, USER_ID);
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
  });

  it("hides an asset that belongs to another user's project", async () => {
    const deps = dependencies();
    deps.assets.getOwned.mockResolvedValue(null);

    await expect(deleteProjectAsset({ userId: "user-b", projectId: PROJECT_ID, assetId: ASSET_ID }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });
});

describe("listProjectAssets", () => {
  it("returns previews only for assets the caller owns", async () => {
    const deps = dependencies();
    const signedUrl = vi.fn(async (key: string) => `https://signed.example/${key}`);

    const assets = await listProjectAssets({ userId: USER_ID, projectId: PROJECT_ID }, { ...deps, signedUrl });

    expect(signedUrl).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
    expect(assets).toEqual([{ id: ASSET_ID, mimeType: "image/png", byteSize: PNG.length, width: 2, height: 3, moderationStatus: "pending", previewUrl: `https://signed.example/video-projects/${PROJECT_ID}/${ASSET_ID}.png` }]);
  });

  it("rejects a project the caller does not own before signing anything", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);
    const signedUrl = vi.fn();

    await expect(listProjectAssets({ userId: "user-b", projectId: PROJECT_ID }, { ...deps, signedUrl })).rejects.toMatchObject({ code: "video_project_not_found" });
    expect(signedUrl).not.toHaveBeenCalled();
  });
});

describe("ProjectAssetResolver", () => {
  it("re-validates stored bytes and refuses mutated ones", async () => {
    const deps = dependencies();
    deps.objectStore.read.mockResolvedValue(PNG);

    const resolver = new ProjectAssetResolver(deps.assets, deps.objectStore);

    await expect(resolver.resolve(ASSET_ID, USER_ID, { maxImageBytes: 1_000_000, maxImageWidth: 8000, maxImageHeight: 8000 })).resolves.toMatchObject({ assetId: ASSET_ID, mimeType: "image/png" });

    deps.objectStore.read.mockResolvedValue(Uint8Array.from([...PNG, 0]));
    await expect(new ProjectAssetResolver(deps.assets, deps.objectStore).resolve(ASSET_ID, USER_ID, { maxImageBytes: 1_000_000, maxImageWidth: 8000, maxImageHeight: 8000 }))
      .rejects.toMatchObject({ code: "video_asset_invalid" });
  });

  it("refuses a blocked asset and another user's asset", async () => {
    const deps = dependencies();
    deps.objectStore.read.mockResolvedValue(PNG);
    deps.assets.getOwned.mockResolvedValue({ id: ASSET_ID, objectKey: "k", mimeType: "image/png", byteSize: PNG.length, sha256: "hash", width: 2, height: 3, moderationStatus: "blocked" });
    const limits = { maxImageBytes: 1_000_000, maxImageWidth: 8000, maxImageHeight: 8000 };

    await expect(new ProjectAssetResolver(deps.assets, deps.objectStore).resolve(ASSET_ID, USER_ID, limits)).rejects.toMatchObject({ code: "video_asset_invalid" });

    deps.assets.getOwned.mockResolvedValue(null);
    await expect(new ProjectAssetResolver(deps.assets, deps.objectStore).resolve(ASSET_ID, "user-b", limits)).rejects.toMatchObject({ code: "video_asset_invalid" });
  });
});
```

Add `import { ProjectAssetResolver } from "./assets";` to the import list in the test file.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/application/video/assets.test.ts`

Expected: FAIL because `./assets` does not exist.

- [ ] **Step 3: Implement `application/video/assets.ts`**

```ts
import { MAX_ASSET_BYTES, type AssetMimeType, type AssetObjectStore } from "../../domain/ai-service/assets";
import type { AIImageLimits } from "../../domain/ai-service/config";
import type { AssetResolver } from "../../domain/ai-service/contracts";
import type { ResolvedAIAsset } from "../../domain/ai-service/types";
import { VideoError } from "../../domain/video/errors";
import { canMutateProjectAssets } from "../../domain/video/state-machine";
import type { AssetLimits } from "../../domain/video/limits";
import type { ProjectAssetRepository, VideoProjectRepository } from "../../domain/video/contracts";
import type { ProjectAsset, VideoProject } from "../../domain/video/types";
import { sha256, validateImage } from "../ai-service/register-asset";

type AssetDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned">;
  assets: ProjectAssetRepository;
  objectStore: AssetObjectStore;
  limits: AssetLimits;
  createId: () => string;
};

export type RegisterProjectAssetCommand = {
  userId: string;
  projectId: string;
  bytes: Uint8Array;
  declaredMimeType: string;
  rightsConfirmed: boolean;
};

export async function registerProjectAsset(command: RegisterProjectAssetCommand, dependencies: AssetDependencies): Promise<ProjectAsset> {
  if (!command.rightsConfirmed) throw invalidInput("Confirm that you have the right to use this asset.");

  const project = await requireEditableProject(command.projectId, command.userId, dependencies);
  const image = validateAsset(command.bytes, command.declaredMimeType, dependencies.limits);
  await enforceProjectLimits(project, command.userId, command.bytes.byteLength, dependencies);

  const id = dependencies.createId();
  const objectKey = objectKeyFor(command.projectId, id, image.mimeType);
  await dependencies.objectStore.write(objectKey, command.bytes, image.mimeType);

  try {
    const asset = await dependencies.assets.create({
      id,
      projectId: project.id,
      userId: command.userId,
      objectKey,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      sha256: sha256(command.bytes),
      width: image.width,
      height: image.height,
      rightsConfirmedAt: new Date().toISOString(),
    });
    await assertProjectStillEditable(command.projectId, command.userId, dependencies);
    return asset;
  } catch (error) {
    await dependencies.objectStore.delete(objectKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteProjectAsset(
  command: { userId: string; projectId: string; assetId: string },
  dependencies: AssetDependencies,
): Promise<void> {
  const project = await requireEditableProject(command.projectId, command.userId, dependencies);
  void project;
  const asset = await dependencies.assets.getOwned(command.assetId, command.userId);
  if (!asset || asset.projectId !== command.projectId) throw invalidInput("The asset was not found.");

  await dependencies.assets.softDelete(command.assetId, command.userId);
  await dependencies.objectStore.delete(asset.objectKey).catch(() => undefined);
}

export type ProjectAssetResponse = {
  id: string;
  mimeType: AssetMimeType;
  byteSize: number;
  width: number;
  height: number;
  moderationStatus: ProjectAsset["moderationStatus"];
  previewUrl: string;
};

export async function listProjectAssets(
  command: { userId: string; projectId: string },
  dependencies: AssetDependencies & { signedUrl: (objectKey: string) => Promise<string> },
): Promise<ProjectAssetResponse[]> {
  const project = await dependencies.projects.getOwned(command.projectId, command.userId);
  if (!project) throw projectNotFound();
  if (project.status === "deleted") throw projectNotFound();

  const assets = await dependencies.assets.listOwned(command.projectId, command.userId);
  return Promise.all(assets.map(async (asset) => ({
    id: asset.id,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    moderationStatus: asset.moderationStatus,
    previewUrl: await dependencies.signedUrl(asset.objectKey),
  })));
}

/**
 * The AI service's extension point for reading project assets. Bytes are re-validated against the
 * persisted hash, size, and dimensions on every read, so an object overwritten after registration
 * is refused rather than sent to a model or a render.
 *
 * `pending` is permitted while the moderation provider is not yet wired; the orchestration plan
 * must flip this to require `allowed` in the same change that adds the moderation call.
 */
export class ProjectAssetResolver implements AssetResolver {
  constructor(
    private readonly assets: Pick<ProjectAssetRepository, "getOwned">,
    private readonly objectStore: AssetObjectStore,
  ) {}

  async resolve(assetId: string, userId: string, limits: AIImageLimits): Promise<ResolvedAIAsset> {
    const asset = await this.assets.getOwned(assetId, userId);
    if (!asset || asset.deletedAt || asset.moderationStatus === "blocked") throw invalidAsset();

    const maxBytes = Math.min(MAX_ASSET_BYTES, limits.maxImageBytes);
    const bytes = await this.objectStore.read(asset.objectKey, maxBytes).catch(() => {
      throw invalidAsset();
    });
    const image = validateAsset(bytes, asset.mimeType, {
      minImageDimension: 1,
      maxImageDimension: Math.max(limits.maxImageWidth, limits.maxImageHeight),
    });

    if (image.byteSize !== asset.byteSize || image.width !== asset.width || image.height !== asset.height || sha256(bytes) !== asset.sha256) throw invalidAsset();
    if (image.width > limits.maxImageWidth || image.height > limits.maxImageHeight) throw invalidAsset();

    return { assetId: asset.id, bytes, mimeType: asset.mimeType };
  }
}

async function requireEditableProject(projectId: string, userId: string, dependencies: AssetDependencies): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || project.status === "deleted") throw projectNotFound();
  if (!canMutateProjectAssets(project.status)) throw new VideoError("video_state_conflict", "Assets cannot change while the video is being rendered.");
  return project;
}

async function assertProjectStillEditable(projectId: string, userId: string, dependencies: AssetDependencies): Promise<void> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || !canMutateProjectAssets(project.status)) throw projectNotFound();
}

async function enforceProjectLimits(project: VideoProject, userId: string, incomingBytes: number, dependencies: AssetDependencies): Promise<void> {
  const [existing, usedBytes] = await Promise.all([
    dependencies.assets.listOwned(project.id, userId),
    dependencies.assets.sumActiveBytes(project.id, userId),
  ]);

  if (existing.length >= dependencies.limits.maxAssetsPerProject) throw limitReached();
  if (usedBytes + incomingBytes > dependencies.limits.maxProjectAssetBytes) throw limitReached();
}

function validateAsset(bytes: Uint8Array, declaredMimeType: string, limits: { minImageDimension: number; maxImageDimension: number }) {
  let image;
  try {
    image = validateImage(bytes, declaredMimeType, MAX_ASSET_BYTES);
  } catch {
    throw invalidAsset();
  }
  if (image.width < limits.minImageDimension || image.height < limits.minImageDimension) throw invalidAsset();
  if (image.width > limits.maxImageDimension || image.height > limits.maxImageDimension) throw invalidAsset();
  return image;
}

export function objectKeyFor(projectId: string, assetId: string, mimeType: AssetMimeType): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return `video-projects/${projectId}/${assetId}.${extension}`;
}

function invalidInput(message: string): VideoError {
  return new VideoError("video_input_invalid", message);
}

function invalidAsset(): VideoError {
  return new VideoError("video_asset_invalid", "The image is unavailable or invalid.");
}

function limitReached(): VideoError {
  return new VideoError("video_asset_limit_reached", "This project already has the maximum number of images.");
}

function projectNotFound(): VideoError {
  return new VideoError("video_project_not_found", "The video project was not found.");
}
```

Note the deliberate asymmetry in the two catch blocks: a failed object write propagates, a failed object delete never masks the original outcome. The same rule applies in `deleteProjectAsset`.

- [ ] **Step 4: Verify the asset-use-case tests GREEN**

Run: `pnpm --filter backend test -- src/application/video/assets.test.ts`

Expected: PASS. The in-flight deletion test passes because `registerProjectAsset` calls `getOwned` twice — once as a precondition, once after the insert — and the second call returns null.

- [ ] **Step 5: Implement the repository and signed-URL factory**

Write `SupabaseProjectAssetRepository` with the same mapping style as `SupabaseVideoProjectRepository`: `getOwned` filters on `id`, `user_id`, and `deleted_at is null`; `listOwned` filters on `project_id`, `user_id`, `deleted_at is null` and orders by `created_at`; `sumActiveBytes` selects `byte_size` for the same filters and reduces in JavaScript; `softDelete` sets `deleted_at`. `create` inserts with the caller's id and `moderation_status` left at its database default.

```ts
// apps/backend/src/infrastructure/video/supabase-signed-urls.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@visuala/db";

export const SIGNED_URL_TTL_SECONDS = 300;

/** Returns short-lived URLs only; a signed URL is never stored as a canonical asset reference. */
export function createSupabaseSignedUrlFactory(client: SupabaseClient<Database>, bucket: string): (objectKey: string) => Promise<string> {
  return async (objectKey: string) => {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw error ?? new Error("Could not sign the object.");
    return data.signedUrl;
  };
}
```

- [ ] **Step 6: Write the route and repository tests**

Cover, in `src/infrastructure/video/supabase-project-asset-repository.test.ts`: owner-qualified reads, soft-deleted rows hidden, `sumActiveBytes` summing only active rows, the insert never writing a caller-supplied `moderation_status`, and no public or signed URL anywhere in the returned objects.

Cover, in `src/routes/video.test.ts`: `POST /video-projects/:projectId/assets` rejects a non-image `content-type` with 422 and never calls the use case; accepts `image/png` and returns `201` with the asset projection; `GET` returns signed preview URLs; `DELETE` returns 404 for another user's asset; and every asset route requires authentication.

- [ ] **Step 7: Verify RED, then implement the routes and wire the factory**

Run: `pnpm --filter backend test -- src/infrastructure/video/supabase-project-asset-repository.test.ts src/routes/video.test.ts`

Expected: FAIL for the new cases only.

Add to `createVideoProjectServices` the `signedUrl` dependency using `createSupabaseSignedUrlFactory(supabase, readAssetBucket(environment))`, and add the asset routes to `videoProjectRoutes` following the `/ai/assets` route's content-type and content-length pre-checks before reading the body:

```ts
  .post(
    "/video-projects/:projectId/assets",
    async ({ params, request, set, user }) => {
      const declaredMimeType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!DECLARED_MIME_TYPES.has(declaredMimeType)) throw new VideoError("video_asset_invalid", "Upload a valid JPEG, PNG, or WebP image up to 10 MB.");

      const rightsConfirmed = request.headers.get("x-asset-rights-confirmed") === "true";
      const bytes = new Uint8Array(await request.arrayBuffer());
      const asset = await registerProjectAsset(
        { userId: user.id, projectId: params.projectId, bytes, declaredMimeType, rightsConfirmed },
        createVideoProjectServices(),
      );

      set.status = 201;
      return { asset: { id: asset.id, mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width, height: asset.height, moderationStatus: asset.moderationStatus } };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
```

- [ ] **Step 8: Verify GREEN**

Run: `pnpm --filter backend test -- src/application/video src/infrastructure/video src/routes/video.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit if authorized**

```bash
git add apps/backend/src/application/video/assets.ts apps/backend/src/infrastructure/video apps/backend/src/routes/video.ts apps/backend/src/routes/video.test.ts apps/backend/src/schemas/video.ts
git commit -m "feat: add project asset upload and deletion"
```

### Task 11: Messages And Revision Persistence

The route in this task persists what the user says. It does not call a model: the assistant reply, the interviewer loop, and the moderation call belong to the AI orchestration plan, which fills in the behaviour behind the same `POST /video-projects/:projectId/messages` contract.

**Files:**
- Create: `apps/backend/src/application/video/messages.ts`
- Create: `apps/backend/src/application/video/revisions.ts`
- Create: `apps/backend/src/infrastructure/video/supabase-video-message-repository.ts`
- Create: `apps/backend/src/infrastructure/video/supabase-video-revision-repositories.ts`
- Create: `apps/backend/src/application/video/messages.test.ts`
- Create: `apps/backend/src/application/video/revisions.test.ts`
- Modify: `apps/backend/src/application/video/services.ts`
- Modify: `apps/backend/src/domain/video/contracts.ts` (add `getOwned(revisionId, userId)` to `VideoBriefRevisionRepository`)
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`

**Interfaces:**
- Consumes: `videoBriefSchema`, `findMissingBriefFields`, `findUnsupportedCommercialFacts`, `storyboardSchema`, `findStoryboardProblems`, `storyboardTotalDurationSeconds`; `VideoMessageRepository`, `VideoBriefRevisionRepository`, `VideoStoryboardRevisionRepository`.
- Produces: `appendVideoMessage`, `listVideoMessages`, `toMessageResponse`, `saveBriefRevision`, `saveStoryboardRevision`; routes `POST|GET /video-projects/:projectId/messages`.

`saveBriefRevision` and `saveStoryboardRevision` deliberately have no route. They are called by the AI orchestration layer and tested here with fixtures so that approval has something real to consume.

- [ ] **Step 1: Write the failing message tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { appendVideoMessage } from "./messages";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function dependencies(status = "draft") {
  return {
    createId: () => "message-1",
    projects: { getOwned: vi.fn(async () => ({ id: PROJECT_ID, userId: USER_ID, status })), transition: vi.fn(async () => ({ id: PROJECT_ID, status: "interviewing" })) },
    messages: { append: vi.fn(async (input) => ({ ...input, controls: null, assetIds: [], createdAt: "created" })), listOwned: vi.fn(async () => []) },
  };
}

describe("appendVideoMessage", () => {
  it("moves a draft project into interviewing on the first user message", async () => {
    const deps = dependencies("draft");

    const { project } = await appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "buat video jualan produk ini" }, deps);

    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "draft", "interviewing");
    expect(project.status).toBe("interviewing");
  });

  it("does not re-enter the transition once the project is already interviewing", async () => {
    const deps = dependencies("interviewing");

    await appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "harganya lima belas ribu" }, deps);

    expect(deps.projects.transition).not.toHaveBeenCalled();
  });

  it("treats a lost transition race as success", async () => {
    const deps = dependencies("draft");
    deps.projects.transition.mockResolvedValue(null);

    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps)).resolves.toMatchObject({ project: { status: "interviewing" } });
  });

  it("rejects blank content and a missing project", async () => {
    const deps = dependencies();

    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "   " }, deps)).rejects.toMatchObject({ code: "video_input_invalid" });

    deps.projects.getOwned.mockResolvedValue(null);
    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });

  it("refuses to add chat to a deleted project", async () => {
    const deps = dependencies("deleted");

    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });
});
```

- [ ] **Step 2: Verify RED, then implement `application/video/messages.ts`**

Run: `pnpm --filter backend test -- src/application/video/messages.test.ts`

Expected: FAIL because `./messages` does not exist.

Implement `appendVideoMessage` so it: loads the project with `getOwned`, throws `video_project_not_found` when it is missing or `deleted`, trims and length-checks the content against 1–4000 characters, transitions `draft → interviewing` when the project is still a draft (and re-reads the project when the conditional update matched no row, because another request already moved it), appends the row with the server-generated id and `role: "user"`, and returns `{ message, project }`. `listVideoMessages` returns the projection `{ id, role, content, assetIds, controls, createdAt }` and throws `video_project_not_found` for a project the caller does not own.

- [ ] **Step 3: Verify the message tests GREEN**

Run: `pnpm --filter backend test -- src/application/video/messages.test.ts`

Expected: PASS.

- [ ] **Step 4: Write the failing revision tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { findMissingBriefFields } from "../../domain/video/brief";
import { saveBriefRevision, saveStoryboardRevision } from "./revisions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const generatedBy = { profileId: "primary", provider: "9router", model: "router-model", promptVersion: "interviewer-v1", requestId: "req-1" };
const settings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

const brief = {
  productName: "Kopi Susu", productCategory: null, audience: "Mahasiswa", objective: "Tambah pesanan", keyMessage: "Manisnya pas",
  offer: null, callToAction: "Pesan sekarang", orderDestination: null, brandName: null,
  styleId: "bold_pop", outputSettings: settings, menuItems: null, facts: [],
};

const scenes = [
  { order: 1, startSeconds: 0, endSeconds: 5, visual: "Produk di meja", onScreenTitle: "Kopi Susu", onScreenCopy: "Manisnya pas", voiceOver: "Coba kopi susu kami", caption: "Coba kopi susu kami", assetIds: [ASSET_ID], audioCue: null, transition: "fade" },
  { order: 2, startSeconds: 5, endSeconds: 10, visual: "Logo", onScreenTitle: "Pesan sekarang", onScreenCopy: "WhatsApp kami", voiceOver: "Pesan sekarang", caption: "Pesan sekarang", assetIds: [ASSET_ID], audioCue: null, transition: "cut" },
];

function dependencies() {
  return {
    projects: { getOwned: vi.fn(async () => ({ id: PROJECT_ID, status: "interviewing", settings, videoType: "product_promo" })) },
    briefRevisions: { create: vi.fn(async (input) => ({ ...input, id: BRIEF_ID, version: 1, createdAt: "created" })), latestOwned: vi.fn(async () => null), getOwned: vi.fn(async () => ({ id: BRIEF_ID, projectId: PROJECT_ID })) },
    storyboardRevisions: { create: vi.fn(async (input) => ({ ...input, id: "sb-1", version: 1, createdAt: "created" })), latestOwned: vi.fn(async () => null) },
    createId: () => "id-1",
  };
}

describe("saveBriefRevision", () => {
  it("marks a complete brief complete", async () => {
    const revision = await saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief, generatedBy, sourceMessageIds: [] }, dependencies());

    expect(revision.isComplete).toBe(true);
  });

  it("marks a brief with a missing required field incomplete", async () => {
    const incomplete = { ...brief, callToAction: null };

    expect(findMissingBriefFields(incomplete as never, "product_promo")).toEqual(["callToAction"]);
    const revision = await saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief: incomplete, generatedBy, sourceMessageIds: [] }, dependencies());
    expect(revision.isComplete).toBe(false);
  });

  it("marks a brief with an unconfirmed price incomplete and stores the unparsed value unchanged", async () => {
    const priced = { ...brief, offer: { label: "Promo", detail: "Diskon 30%" } };
    const deps = dependencies();

    const revision = await saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief: priced, generatedBy, sourceMessageIds: [] }, deps);

    expect(revision.isComplete).toBe(false);
    expect(deps.briefRevisions.create.mock.calls[0]?.[0].brief).toEqual(priced);
  });

  it("rejects a brief the schema cannot represent", async () => {
    await expect(saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief: { ...brief, discountPercent: 50 }, generatedBy, sourceMessageIds: [] }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });
});

describe("saveStoryboardRevision", () => {
  it("stores a storyboard that fills the project duration", async () => {
    const revision = await saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes, generatedBy }, dependencies());

    expect(revision.totalDurationSeconds).toBe(10);
  });

  it("rejects a storyboard with a timeline gap or the wrong total", async () => {
    const gapped = [scenes[0], { ...scenes[1], startSeconds: 6, endSeconds: 11 }];
    const short = [scenes[0]];

    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes: gapped, generatedBy }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes: short, generatedBy }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });

  it("rejects a storyboard that drops voice-over while the project needs it", async () => {
    const silent = scenes.map((scene) => ({ ...scene, voiceOver: null, caption: null }));

    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes: silent, generatedBy }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });

  it("rejects a brief revision the caller does not own", async () => {
    const deps = dependencies();
    deps.briefRevisions.getOwned.mockResolvedValue(null);

    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes, generatedBy }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });
});
```

- [ ] **Step 5: Verify RED, then implement `application/video/revisions.ts`**

Run: `pnpm --filter backend test -- src/application/video/revisions.test.ts`

Expected: FAIL because `./revisions` does not exist.

Implement so that:

- `saveBriefRevision` loads the project with `getOwned` (not found or deleted → `video_project_not_found`), parses the brief with `videoBriefSchema` (failure → `video_input_invalid`), computes `isComplete` as "no missing required fields for the project's video type **and** no unsupported commercial facts", and creates the row with the version assigned by the repository.
- `saveStoryboardRevision` loads the project, loads the referenced brief revision with `briefRevisions.getOwned(briefRevisionId, userId)` (missing → `video_input_invalid`), parses with `storyboardSchema` and `findStoryboardProblems(scenes, project.settings)` (any problem → `video_input_invalid`), derives `totalDurationSeconds` with `storyboardTotalDurationSeconds`, and creates the row.

- [ ] **Step 6: Verify the revision tests GREEN**

Run: `pnpm --filter backend test -- src/application/video/revisions.test.ts`

Expected: PASS.

- [ ] **Step 7: Implement the repositories, routes, and wiring**

- `SupabaseVideoMessageRepository`: `append` inserts and returns the mapped row; `listOwned` filters on `project_id`, `user_id` and orders by `created_at` ascending.
- `SupabaseVideoRevisionRepository` (both interfaces in one file): `create` assigns `version` as `max(version) + 1` for the project inside a `select max(version)` read — and the unique index `(project_id, version)` is the real guard, so a conflict must be retried once rather than surfaced; `latestOwned` orders by `version desc` and takes one; `getOwned` filters on `id`, `user_id`; `approve` writes only `approved_at` and `approval_snapshot`.
- Add the routes to `videoProjectRoutes`: `POST /video-projects/:projectId/messages` with a strict `{ content: string, assetIds?: string[] }` body, returning `{ message, project }` with status 201, and `GET /video-projects/:projectId/messages` returning `{ messages }`.
- Add `messages`, `briefRevisions`, and `storyboardRevisions` to `createVideoProjectServices`.

Extend `src/routes/video.test.ts` with: authentication on both message routes; a body carrying `role` or `user_id` is rejected with 422; the first message answers `{ message, project }` with the project in `interviewing`; a message on another user's project is 404.

- [ ] **Step 8: Verify GREEN**

Run: `pnpm --filter backend test -- src/application/video src/infrastructure/video src/routes/video.test.ts src/schemas/video.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit if authorized**

```bash
git add apps/backend/src/application/video apps/backend/src/infrastructure/video apps/backend/src/routes/video.ts apps/backend/src/routes/video.test.ts apps/backend/src/domain/video/contracts.ts
git commit -m "feat: persist chat messages and video revisions"
```

### Task 12: Approval With An Immutable Snapshot

**Files:**
- Create: `apps/backend/src/application/video/approval.ts`
- Create: `apps/backend/src/application/video/approval.test.ts`
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`

**Interfaces:**
- Consumes: `videoBriefSchema`, `findMissingBriefFields`, `findUnsupportedCommercialFacts`; `storyboardSchema`, `findStoryboardProblems`; `VideoBriefRevisionRepository`, `VideoStoryboardRevisionRepository`, `VideoProjectRepository`.
- Produces: `approveVideoProject`, `buildApprovalSnapshot`, `approvalSnapshotSchema`, `APPROVAL_SCHEMA_VERSION`; route `POST /video-projects/:projectId/approve`; and for Task 13, the fact that an approved storyboard revision carries `approvedAt` and `approvalSnapshot`.

The snapshot is what makes a render reproducible: it pins the brief revision, the storyboard revision, the settings, the style, and the provider identity that produced them. Task 13 copies it into the job.

- [ ] **Step 1: Write the failing approval tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { approveVideoProject } from "./approval";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const STORYBOARD_ID = "55555555-5555-4555-8555-555555555555";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const settings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };
const generatedBy = { profileId: "primary", provider: "9router", model: "router-model", promptVersion: "planner-v1", requestId: "req-1" };

const brief = {
  productName: "Kopi Susu", productCategory: null, audience: "Mahasiswa", objective: "Tambah pesanan", keyMessage: "Manisnya pas",
  offer: null, callToAction: "Pesan sekarang", orderDestination: null, brandName: null,
  styleId: "bold_pop", outputSettings: settings, menuItems: null, facts: [],
};

const scenes = [
  { order: 1, startSeconds: 0, endSeconds: 5, visual: "Produk", onScreenTitle: "Kopi Susu", onScreenCopy: "Manisnya pas", voiceOver: "Coba", caption: "Coba", assetIds: [ASSET_ID], audioCue: null, transition: "fade" },
  { order: 2, startSeconds: 5, endSeconds: 10, visual: "Logo", onScreenTitle: "Pesan", onScreenCopy: "WhatsApp", voiceOver: "Pesan sekarang", caption: "Pesan sekarang", assetIds: [ASSET_ID], audioCue: null, transition: "cut" },
];

function dependencies(overrides: { status?: string; brief?: unknown; scenes?: unknown; briefRevisionId?: string; approvedAt?: string | null } = {}) {
  const approvedAt = overrides.approvedAt === undefined ? "2026-09-21T10:00:00.000Z" : overrides.approvedAt;
  const approvalSnapshot = approvedAt === null
    ? {}
    : {
        approvalSnapshot: buildApprovalSnapshot({
          project: { videoType: "product_promo", styleId: "bold_pop", settings },
          briefRevision: { id: BRIEF_ID, version: 2 },
          storyboardRevision: { id: STORYBOARD_ID, version: 3 },
          generatedBy,
          approvedAt,
        }),
        approvedAt,
      };

  return {
    now: () => "2026-09-21T10:00:00.000Z",
    projects: {
      getOwned: vi.fn(async () => ({ id: PROJECT_ID, userId: USER_ID, status: overrides.status ?? "awaiting_approval", videoType: "product_promo", styleId: "bold_pop", settings })),
      transition: vi.fn(async () => ({ id: PROJECT_ID, status: "approved" })),
    },
    briefRevisions: { latestOwned: vi.fn(async () => ({ id: BRIEF_ID, version: 2, brief: overrides.brief ?? brief, generatedBy, isComplete: true })) },
    storyboardRevisions: {
      latestOwned: vi.fn(async () => ({ id: STORYBOARD_ID, version: 3, briefRevisionId: overrides.briefRevisionId ?? BRIEF_ID, scenes: overrides.scenes ?? scenes, totalDurationSeconds: 10, generatedBy, ...approvalSnapshot })),
      approve: vi.fn(async (revisionId: string, userId: string, approvedAt: string, snapshot: unknown) => ({ id: revisionId, approvedAt, approvalSnapshot: snapshot })),
    },
  };
}
```

Import `buildApprovalSnapshot` at the top of the test file. When `approvedAt` is left at its default the fixture reports a revision that is already approved, which is what the default project status also implies; pass `approvedAt: null` to model an unapproved storyboard.

```ts
describe("approveVideoProject", () => {
  it("freezes the brief, storyboard, settings, style, and provider identity", async () => {
    const deps = dependencies();

    const { project, approval } = await approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(project.status).toBe("approved");
    expect(approval).toMatchObject({
      schemaVersion: "video-approval@v1",
      approvedAt: "2026-09-21T10:00:00.000Z",
      briefRevisionId: BRIEF_ID,
      briefVersion: 2,
      storyboardRevisionId: STORYBOARD_ID,
      storyboardVersion: 3,
      styleId: "bold_pop",
      settings,
      promptVersion: "planner-v1",
      provider: "9router",
      model: "router-model",
      profileId: "primary",
    });
  });

  it("refuses a brief that is missing a required field for the video type", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ brief: { ...brief, callToAction: null } })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("refuses a commercial fact the user never confirmed and names it", async () => {
    const priced = { ...brief, offer: { label: "Promo", detail: "Diskon 30%" } };

    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ brief: priced })))
      .rejects.toThrowError(/offer\.label/);
  });

  it("refuses a storyboard that does not fill the project duration", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ scenes: [scenes[0]] })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("refuses a storyboard built from a different brief revision", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ briefRevisionId: "66666666-6666-4666-8666-666666666666" })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("refuses to approve a project that is not awaiting approval", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ status: "draft" })))
      .rejects.toMatchObject({ code: "video_state_conflict" });
  });

  it("returns the frozen snapshot on a repeated approval without writing again", async () => {
    const deps = dependencies({ status: "approved", approvedAt: "2026-09-21T10:00:00.000Z" });

    const { approval } = await approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(approval.storyboardRevisionId).toBe(STORYBOARD_ID);
    expect(deps.storyboardRevisions.approve).not.toHaveBeenCalled();
  });

  it("treats a lost transition race as an already approved project", async () => {
    const deps = dependencies();
    deps.projects.transition.mockResolvedValue(null);
    deps.projects.getOwned
      .mockResolvedValueOnce({ id: PROJECT_ID, status: "awaiting_approval", settings, videoType: "product_promo", styleId: "bold_pop" })
      .mockResolvedValue({ id: PROJECT_ID, status: "approved", settings, videoType: "product_promo", styleId: "bold_pop" });

    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, deps)).resolves.toMatchObject({ project: { status: "approved" } });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/application/video/approval.test.ts`

Expected: FAIL because `./approval` does not exist.

- [ ] **Step 3: Implement `application/video/approval.ts`**

```ts
import { z } from "zod";
import { findMissingBriefFields, findUnsupportedCommercialFacts, videoBriefSchema } from "../../domain/video/brief";
import { findStoryboardProblems, storyboardSchema } from "../../domain/video/storyboard";
import { outputSettingsSchema, VIDEO_STYLE_IDS } from "../../domain/video/settings";
import { VideoError } from "../../domain/video/errors";
import type { VideoBriefRevisionRepository, VideoProjectRepository, VideoStoryboardRevisionRepository } from "../../domain/video/contracts";
import type { VideoOutputSettings, VideoProject, VideoStyleId, VideoType } from "../../domain/video/types";

export const APPROVAL_SCHEMA_VERSION = "video-approval@v1";

export const approvalSnapshotSchema = z.object({
  schemaVersion: z.literal(APPROVAL_SCHEMA_VERSION),
  approvedAt: z.string(),
  briefRevisionId: z.string().uuid(),
  briefVersion: z.number().int().positive(),
  storyboardRevisionId: z.string().uuid(),
  storyboardVersion: z.number().int().positive(),
  videoType: z.enum(["product_promo", "discount_promo", "product_launch", "menu_showcase"]),
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsSchema,
  promptVersion: z.string().min(1),
  profileId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
}).strict();

export type ApprovalSnapshot = z.infer<typeof approvalSnapshotSchema>;

type ApprovalDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned" | "transition">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "latestOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "latestOwned" | "approve">;
  now: () => string;
};

export async function approveVideoProject(
  command: { userId: string; projectId: string },
  dependencies: ApprovalDependencies,
): Promise<{ project: VideoProject; approval: ApprovalSnapshot }> {
  const project = await requireProject(command.projectId, command.userId, dependencies);

  if (project.status === "approved") {
    const existing = await dependencies.storyboardRevisions.latestOwned(project.id, command.userId);
    if (existing?.approvedAt) return { project, approval: approvalSnapshotSchema.parse(existing.approvalSnapshot) };
    throw new VideoError("video_state_conflict", "The project has no approved storyboard to return.");
  }

  if (project.status !== "awaiting_approval" && project.status !== "revision_draft") {
    throw new VideoError("video_state_conflict", `A project in ${project.status} cannot be approved.`);
  }

  const briefRevision = await dependencies.briefRevisions.latestOwned(project.id, command.userId);
  if (!briefRevision) throw incomplete("A brief is required before approval.");

  const brief = videoBriefSchema.safeParse(briefRevision.brief);
  if (!brief.success) throw incomplete("The brief is not valid.");
  const missing = findMissingBriefFields(brief.data, project.videoType);
  if (missing.length > 0) throw incomplete(`The brief is missing: ${missing.join(", ")}.`);
  const unsupported = findUnsupportedCommercialFacts(brief.data);
  if (unsupported.length > 0) throw incomplete(`Confirm these details first: ${unsupported.join(", ")}.`);

  const storyboardRevision = await dependencies.storyboardRevisions.latestOwned(project.id, command.userId);
  if (!storyboardRevision) throw incomplete("A storyboard is required before approval.");
  if (storyboardRevision.briefRevisionId !== briefRevision.id) throw incomplete("The storyboard was built from a different brief.");

  const storyboard = storyboardSchema.safeParse({ scenes: storyboardRevision.scenes });
  if (!storyboard.success) throw incomplete("The storyboard is not valid.");
  const problems = findStoryboardProblems(storyboard.data.scenes, project.settings);
  if (problems.length > 0) throw incomplete(`The storyboard cannot be rendered: ${problems.join(", ")}.`);

  const approval = buildApprovalSnapshot({
    project,
    briefRevision,
    storyboardRevision,
    generatedBy: briefRevision.generatedBy,
    approvedAt: dependencies.now(),
  });

  const approved = await dependencies.storyboardRevisions.approve(storyboardRevision.id, command.userId, approval.approvedAt, approval);
  if (!approved) throw new VideoError("video_state_conflict", "The storyboard changed before it could be approved.");

  const transitioned = await dependencies.projects.transition(project.id, command.userId, project.status, "approved");
  if (!transitioned) {
    const current = await requireProject(command.projectId, command.userId, dependencies);
    if (current.status !== "approved") throw new VideoError("video_state_conflict", "The project could not be approved.");
    return { project: current, approval };
  }

  return { project: transitioned, approval };
}

export function buildApprovalSnapshot(input: {
  project: Pick<VideoProject, "videoType" | "styleId" | "settings">;
  briefRevision: { id: string; version: number };
  storyboardRevision: { id: string; version: number };
  generatedBy: { profileId: string; provider: string; model: string; promptVersion: string };
  approvedAt: string;
}): ApprovalSnapshot {
  return approvalSnapshotSchema.parse({
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvedAt: input.approvedAt,
    briefRevisionId: input.briefRevision.id,
    briefVersion: input.briefRevision.version,
    storyboardRevisionId: input.storyboardRevision.id,
    storyboardVersion: input.storyboardRevision.version,
    videoType: input.project.videoType,
    styleId: input.project.styleId,
    settings: input.project.settings,
    promptVersion: input.generatedBy.promptVersion,
    profileId: input.generatedBy.profileId,
    provider: input.generatedBy.provider,
    model: input.generatedBy.model,
  });
}

async function requireProject(projectId: string, userId: string, dependencies: ApprovalDependencies): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project) throw new VideoError("video_project_not_found", "The video project was not found.");
  return project;
}

function incomplete(message: string): VideoError {
  return new VideoError("video_approval_incomplete", message);
}
```

Use `videoType: videoTypeSchema` from `domain/video/settings.ts` instead of the inline four-value enum if that schema is exported there; keep the two in sync, since an approval snapshot that fails to parse would break Task 13.

- [ ] **Step 4: Verify the approval tests GREEN**

Run: `pnpm --filter backend test -- src/application/video/approval.test.ts`

Expected: PASS.

- [ ] **Step 5: Add the route and verify**

Add to `videoProjectRoutes`:

```ts
  .post(
    "/video-projects/:projectId/approve",
    async ({ params, user }) => approveVideoProject({ userId: user.id, projectId: params.projectId }, createVideoApprovalServices()),
    { auth: true, detail: { tags: ["video"] } },
  )
```

where `createVideoApprovalServices()` in `application/video/services.ts` returns the project, brief-revision, and storyboard-revision repositories plus `now: () => new Date().toISOString()`.

Extend `src/routes/video.test.ts` with: authentication is required; an incomplete project answers 409 with code `video_approval_incomplete`; an approved project answers 200 with the snapshot; and no response field exposes an object key or a repository row.

Run: `pnpm --filter backend test -- src/application/video src/routes/video.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit if authorized**

```bash
git add apps/backend/src/application/video/approval.ts apps/backend/src/application/video/approval.test.ts apps/backend/src/application/video/services.ts apps/backend/src/routes/video.ts apps/backend/src/routes/video.test.ts
git commit -m "feat: approve briefs and freeze render snapshots"
```

### Task 13: Render Job Intake, Worker Handoff, Cancellation, And Versions

This task owns the rerender quota and the idempotency guarantees. Nothing here renders: `createRenderJob` writes the immutable job row, `beginRenderJob` is the entry point the render plan's worker calls, and the render plan supplies the worker that writes versions.

**Files:**
- Create: `apps/backend/src/domain/video/render-input.ts`
- Create: `apps/backend/src/application/video/render-jobs.ts`
- Create: `apps/backend/src/application/video/versions.ts`
- Create: `apps/backend/src/domain/video/render-input.test.ts`
- Create: `apps/backend/src/application/video/render-jobs.test.ts`
- Create: `apps/backend/src/application/video/versions.test.ts`
- Create: `apps/backend/src/infrastructure/video/supabase-render-job-repository.ts`
- Modify: `apps/backend/src/infrastructure/video/supabase-version-repository.ts` (created by Task 9 with `listOwned`; add `create`, `getOwned`, and `latestOwned`)
- Modify: `apps/backend/src/domain/video/contracts.ts` (add `getById` and `fail` to `VideoRenderJobRepository`; add `create` to `VideoVersionRepository`)
- Modify: `apps/backend/src/application/video/services.ts`
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`

**Interfaces:**
- Consumes: `MAX_RERENDERS_PER_PROJECT`, `isRenderJobActive`, `assertVideoProjectTransition`, `toProjectResponse`, `createSupabaseSignedUrlFactory`.
- Produces: `RENDER_INPUT_SCHEMA_VERSION`, `renderJobInputSnapshotSchema`, `RenderJobInputSnapshot`; `createRenderJob`, `beginRenderJob`, `cancelRenderJob`, `toRenderJobResponse`; `listVideoVersions`, `createVersionDownloadUrl`; routes `POST /video-projects/:projectId/render-jobs`, `GET /video-projects/:projectId/render-jobs/:jobId`, `POST /video-projects/:projectId/render-jobs/:jobId/cancel`, `GET /video-projects/:projectId/versions`, `GET /video-projects/:projectId/versions/:versionId/download`.

- [ ] **Step 1: Write the failing render-input test**

```ts
import { describe, expect, it } from "vitest";
import { RENDER_INPUT_SCHEMA_VERSION, renderJobInputSnapshotSchema } from "./render-input";

const snapshot = {
  schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
  briefRevisionId: "44444444-4444-4444-8444-444444444444",
  storyboardRevisionId: "55555555-5555-4555-8555-555555555555",
  styleId: "bold_pop",
  settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true },
  variantSeed: "77777777-7777-4777-8777-777777777777",
};

describe("render job input snapshot", () => {
  it("accepts a complete snapshot", () => {
    expect(renderJobInputSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("rejects a snapshot missing the variant seed or carrying an unknown key", () => {
    const { variantSeed, ...withoutSeed } = snapshot;
    expect(renderJobInputSnapshotSchema.safeParse(withoutSeed).success).toBe(false);
    expect(renderJobInputSnapshotSchema.safeParse({ ...snapshot, templateId: "t-1" }).success).toBe(false);
  });
});
```

The last assertion is deliberate: adding template fields requires raising `RENDER_INPUT_SCHEMA_VERSION` in the render plan, so an old worker can never silently accept a snapshot it does not understand.

- [ ] **Step 2: Verify RED, then implement `domain/video/render-input.ts`**

Run: `pnpm --filter backend test -- src/domain/video/render-input.test.ts`

Expected: FAIL, then PASS.

```ts
import { z } from "zod";
import { VIDEO_STYLE_IDS, outputSettingsSchema } from "./settings";

/** Bump this whenever a field is added or removed: a job snapshot is an immutable contract. */
export const RENDER_INPUT_SCHEMA_VERSION = "render-input@v1";

export const renderJobInputSnapshotSchema = z.object({
  schemaVersion: z.literal(RENDER_INPUT_SCHEMA_VERSION),
  briefRevisionId: z.string().uuid(),
  storyboardRevisionId: z.string().uuid(),
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsSchema,
  variantSeed: z.string().uuid(),
}).strict();

export type RenderJobInputSnapshot = z.infer<typeof renderJobInputSnapshotSchema>;
```

- [ ] **Step 3: Write the failing render-job tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { beginRenderJob, cancelRenderJob, createRenderJob } from "./render-jobs";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const STORYBOARD_ID = "55555555-5555-4555-8555-555555555555";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";

const settings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

function job(overrides = {}) {
  return { id: "job-1", projectId: PROJECT_ID, userId: USER_ID, idempotencyKey: "render-0001", briefRevisionId: BRIEF_ID, storyboardRevisionId: STORYBOARD_ID, isRevision: false, status: "queued" as const, attempts: 0, inputSnapshot: {}, queuedAt: "queued", createdAt: "created", updatedAt: "updated", ...overrides };
}

function dependencies(overrides: { status?: string; revisionRenderCount?: number; existingJob?: unknown; activeJob?: unknown; latestVersion?: unknown; approvedAt?: string | null } = {}) {
  return {
    createId: () => "99999999-9999-4999-8999-999999999999",
    projects: {
      getOwned: vi.fn(async () => ({ id: PROJECT_ID, userId: USER_ID, status: overrides.status ?? "approved", videoType: "product_promo", styleId: "bold_pop", settings, revisionRenderCount: overrides.revisionRenderCount ?? 0 })),
      transition: vi.fn(async () => ({ id: PROJECT_ID, status: "rendering" })),
      consumeRerender: vi.fn(async () => ({ id: PROJECT_ID, revisionRenderCount: 1 })),
    },
    briefRevisions: { latestOwned: vi.fn(async () => ({ id: BRIEF_ID, version: 1 })) },
    storyboardRevisions: { latestOwned: vi.fn(async () => ({ id: STORYBOARD_ID, version: 1, briefRevisionId: BRIEF_ID, approvedAt: overrides.approvedAt === undefined ? "2026-09-21T10:00:00.000Z" : overrides.approvedAt })) },
    versions: { latestOwned: vi.fn(async () => overrides.latestVersion ?? null) },
    jobs: {
      create: vi.fn(async (input) => job({ ...input, isRevision: input.isRevision })),
      findByIdempotencyKey: vi.fn(async () => overrides.existingJob ?? null),
      findActiveForProject: vi.fn(async () => overrides.activeJob ?? null),
      getOwned: vi.fn(async () => job()),
      getById: vi.fn(async () => job()),
      begin: vi.fn(async () => job({ status: "preparing" })),
      fail: vi.fn(),
      cancel: vi.fn(async () => job({ status: "cancelled" })),
    },
  };
}

describe("createRenderJob", () => {
  it("queues a job with an immutable snapshot and a stable variant seed", async () => {
    const deps = dependencies();

    const { job: created, created: isNew } = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

    expect(isNew).toBe(true);
    expect(created.status).toBe("queued");
    expect(deps.jobs.create.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT_ID,
      idempotencyKey: "render-0001",
      briefRevisionId: BRIEF_ID,
      storyboardRevisionId: STORYBOARD_ID,
      isRevision: false,
      inputSnapshot: { schemaVersion: "render-input@v1", variantSeed: "99999999-9999-4999-8999-999999999999" },
    });
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "approved", "rendering");
  });

  it("returns the first job for a repeated idempotency key without writing again", async () => {
    const existing = job({ id: "job-existing" });
    const deps = dependencies({ existingJob: existing, status: "rendering" });

    const result = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

    expect(result).toEqual({ job: existing, created: false });
    expect(deps.jobs.create).not.toHaveBeenCalled();
  });

  it("returns the first job when two identical requests race and the second hits the unique index", async () => {
    const deps = dependencies();
    deps.jobs.create.mockRejectedValue({ code: "23505" });
    deps.jobs.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(job({ id: "job-first" }));

    const result = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

    expect(result).toEqual({ job: job({ id: "job-first" }), created: false });
  });

  it("refuses a second, different render request while one is active", async () => {
    const deps = dependencies({ activeJob: job() });

    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0002" }, deps))
      .rejects.toMatchObject({ code: "video_state_conflict" });
    expect(deps.jobs.create).not.toHaveBeenCalled();
  });

  it("refuses a project that is not approved or whose storyboard is unapproved", async () => {
    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, dependencies({ status: "interviewing" })))
      .rejects.toMatchObject({ code: "video_state_conflict" });
    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, dependencies({ approvedAt: null })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("treats a rerender as a revision and refuses the fourth one without changing the project", async () => {
    const revision = dependencies({ latestVersion: { id: VERSION_ID } });
    const result = await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, revision);

    expect(result.job.isRevision).toBe(true);
    expect(revision.jobs.create.mock.calls[0]?.[0]).toMatchObject({ isRevision: true, parentVersionId: VERSION_ID });

    const exhausted = dependencies({ latestVersion: { id: VERSION_ID }, revisionRenderCount: 3 });
    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0004" }, exhausted))
      .rejects.toMatchObject({ code: "video_revision_quota_exhausted" });
    expect(exhausted.projects.transition).not.toHaveBeenCalled();
    expect(exhausted.jobs.create).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed idempotency key before reading anything", async () => {
    const deps = dependencies();

    await expect(createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "short" }, deps)).rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.projects.getOwned).not.toHaveBeenCalled();
  });
});

describe("beginRenderJob", () => {
  it("consumes exactly one rerender for a revision job", async () => {
    const deps = dependencies();
    deps.jobs.getById.mockResolvedValue(job({ isRevision: true }));

    const started = await beginRenderJob({ jobId: "job-1" }, deps);

    expect(deps.projects.consumeRerender).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    expect(started.status).toBe("preparing");
  });

  it("does not consume a rerender for the first render", async () => {
    const deps = dependencies();

    await beginRenderJob({ jobId: "job-1" }, deps);

    expect(deps.projects.consumeRerender).not.toHaveBeenCalled();
  });

  it("is idempotent once the worker already started", async () => {
    const deps = dependencies();
    deps.jobs.begin.mockResolvedValue(null);
    deps.jobs.getById.mockResolvedValue(job({ status: "rendering" }));

    await expect(beginRenderJob({ jobId: "job-1" }, deps)).resolves.toMatchObject({ status: "rendering" });
    expect(deps.projects.consumeRerender).not.toHaveBeenCalled();
  });

  it("fails the job when the rerender quota was already spent by a racing request", async () => {
    const deps = dependencies();
    deps.jobs.getById.mockResolvedValue(job({ isRevision: true }));
    deps.projects.consumeRerender.mockResolvedValue(null);

    await expect(beginRenderJob({ jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_revision_quota_exhausted" });
    expect(deps.jobs.fail).toHaveBeenCalledWith("job-1", "video_revision_quota_exhausted");
  });

  it("refuses a cancelled job", async () => {
    const deps = dependencies();
    deps.jobs.begin.mockResolvedValue(null);
    deps.jobs.getById.mockResolvedValue(job({ status: "cancelled" }));

    await expect(beginRenderJob({ jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_state_conflict" });
  });
});

describe("cancelRenderJob", () => {
  it("cancels a queued job, returns the project to approved, and spends no rerender", async () => {
    const deps = dependencies();

    const cancelled = await cancelRenderJob({ userId: USER_ID, jobId: "job-1" }, deps);

    expect(cancelled.status).toBe("cancelled");
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
    expect(deps.projects.consumeRerender).not.toHaveBeenCalled();
  });

  it("refuses to cancel once the worker started", async () => {
    const deps = dependencies();
    deps.jobs.cancel.mockResolvedValue(null);

    await expect(cancelRenderJob({ userId: USER_ID, jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_state_conflict" });
  });

  it("hides another user's job", async () => {
    const deps = dependencies();
    deps.jobs.getOwned.mockResolvedValue(null);

    await expect(cancelRenderJob({ userId: "user-b", jobId: "job-1" }, deps)).rejects.toMatchObject({ code: "video_render_job_not_found" });
  });
});
```

Replace `deps.parent()` with a direct assertion: capture the create argument in the revision test and assert `parentVersionId` on it, for example `expect(deps.jobs.create.mock.calls[0]?.[0]).toMatchObject({ isRevision: true, parentVersionId: VERSION_ID })`.

- [ ] **Step 4: Verify RED, then implement `application/video/render-jobs.ts`**

Run: `pnpm --filter backend test -- src/application/video/render-jobs.test.ts`

Expected: FAIL because `./render-jobs` does not exist.

Implementation requirements, in order:

1. `createRenderJob` validates the idempotency key length (8–200) before any read.
2. It loads the project with `getOwned` and returns `video_project_not_found` when missing or deleted.
3. It returns the existing job for the same `(projectId, idempotencyKey)` unchanged, whatever that job's status is — an idempotent retry must never mint a second version.
4. It refuses when an active job exists for the project, using `isRenderJobActive`.
5. It requires the project to be `approved` and the latest storyboard revision to carry `approvedAt`; a missing approval is `video_approval_incomplete`, an unapproved project is `video_state_conflict`.
6. It sets `isRevision` and `parentVersionId` from `versions.latestOwned`, and refuses with `video_revision_quota_exhausted` when `project.revisionRenderCount >= MAX_RERENDERS_PER_PROJECT` and this is a revision — before any write, so a refused fourth render changes nothing.
7. It builds the snapshot with `renderJobInputSnapshotSchema.parse({ ... , variantSeed: dependencies.createId() })`, so the seed is fixed before any render starts.
8. It transitions `approved → rendering`, then creates the job. On a `23505` unique violation it re-reads by idempotency key and returns that job; on any other create failure it rolls the project back to `approved` and rethrows.
9. `beginRenderJob` calls `jobs.begin(jobId)`; when that matches no row it reads the job: an active status returns the job unchanged, anything else raises `video_state_conflict`. For a revision job it calls `projects.consumeRerender`, and on `null` it calls `jobs.fail(jobId, "video_revision_quota_exhausted")` before throwing.
10. `cancelRenderJob` loads the job with `getOwned` (missing → `video_render_job_not_found`), calls `jobs.cancel` (no row → `video_state_conflict`), and on success transitions the project `rendering → approved` so the user can render again.

`isUniqueViolation(error)` is a small exported helper checking `typeof error === "object" && error !== null && (error as { code?: string }).code === "23505"`.

- [ ] **Step 5: Verify the render-job tests GREEN**

Run: `pnpm --filter backend test -- src/application/video/render-jobs.test.ts`

Expected: PASS.

- [ ] **Step 6: Write the failing version tests, then implement `application/video/versions.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { createVersionDownloadUrl, listVideoVersions } from "./versions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";

function dependencies() {
  return {
    signedUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
    projects: { getOwned: vi.fn(async () => ({ id: PROJECT_ID, status: "ready" })) },
    versions: {
      listOwned: vi.fn(async () => [{ id: VERSION_ID, versionNumber: 2, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", outputObjectKey: `video-versions/${PROJECT_ID}/${VERSION_ID}.mp4`, manifestHash: "hash", createdAt: "created" }]),
      getOwned: vi.fn(async () => ({ id: VERSION_ID, projectId: PROJECT_ID, outputObjectKey: `video-versions/${PROJECT_ID}/${VERSION_ID}.mp4` })),
    },
  };
}

describe("versions", () => {
  it("lists versions with a signed playback url and no object key", async () => {
    const versions = await listVideoVersions({ userId: USER_ID, projectId: PROJECT_ID }, dependencies());

    expect(versions).toEqual([{ id: VERSION_ID, versionNumber: 2, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", createdAt: "created", playbackUrl: `https://signed.example/video-versions/${PROJECT_ID}/${VERSION_ID}.mp4` }]);
    expect(JSON.stringify(versions)).not.toContain("outputObjectKey");
  });

  it("signs a download only for the owner of the project and version", async () => {
    const deps = dependencies();

    await expect(createVersionDownloadUrl({ userId: USER_ID, projectId: PROJECT_ID, versionId: VERSION_ID }, deps)).resolves.toMatchObject({ url: `https://signed.example/video-versions/${PROJECT_ID}/${VERSION_ID}.mp4` });

    deps.versions.getOwned.mockResolvedValue(null);
    await expect(createVersionDownloadUrl({ userId: "user-b", projectId: PROJECT_ID, versionId: VERSION_ID }, deps)).rejects.toMatchObject({ code: "video_version_not_found" });
  });
});
```

`video_version_not_found` already exists in `VideoErrorCode` from Task 7 and is mapped to 404 by Task 9, so this use case needs no error-plugin change.

- [ ] **Step 7: Implement the repositories, routes, and wiring**

- `SupabaseRenderJobRepository`: `create` inserts and maps; `findByIdempotencyKey` and `findActiveForProject` both filter on the owning `user_id` in the query itself (the active query uses `.in("status", ["queued", "preparing", "rendering", "uploading"])`); `begin`, `fail`, and `getById` are worker-facing and take no `userId`; `cancel` and `getOwned` are owner-qualified; `getById` and `getOwned` map a single row.
- `SupabaseVideoVersionRepository`: `create`, `listOwned` ordered by `version_number desc`, `getOwned`, `latestOwned`.
- Routes: `POST /video-projects/:projectId/render-jobs` (strict `{ idempotencyKey: string }` body, 201 when created, 200 when an existing job is returned), `GET /video-projects/:projectId/render-jobs/:jobId`, `POST /video-projects/:projectId/render-jobs/:jobId/cancel`, `GET /video-projects/:projectId/versions`, `GET /video-projects/:projectId/versions/:versionId/download`. The job projection is `{ id, status, isRevision, attempts, queuedAt, startedAt, finishedAt, errorCode, createdAt }` — no `inputSnapshot` internals beyond what the UI needs, and no object keys.
- Add the new repositories and `signedUrl` to `createVideoProjectServices`.

Extend `src/routes/video.test.ts` with: authentication on all five routes; a render body carrying `userId` or `status` is rejected with 422; a repeated idempotency key answers 200 with the same job id; a fourth rerender answers 409 with code `video_revision_quota_exhausted`; cancelling a started job answers 409; and the versions response contains no `outputObjectKey`.

- [ ] **Step 8: Verify GREEN and typecheck**

Run: `pnpm --filter backend test -- src/application/video src/infrastructure/video src/domain/video src/schemas/video.test.ts src/routes/video.test.ts`

Run: `pnpm backend:build`

Expected: PASS and a clean typecheck.

- [ ] **Step 9: Commit if authorized**

```bash
git add apps/backend/src/domain/video apps/backend/src/application/video apps/backend/src/infrastructure/video apps/backend/src/routes/video.ts apps/backend/src/routes/video.test.ts apps/backend/src/plugins/errors.ts
git commit -m "feat: add render job intake, cancellation, and versions"
```

### Task 14: Documentation And Full Verification

**Files:**
- Create: `apps/backend/docs/chat-video-generator.md`
- Modify: `apps/backend/docs/ai-provider-service.md`
- Test: every file created by Tasks 1–13

**Interfaces:**
- Consumes: the completed backend surface, the three decision records, and the environment variables added by Tasks 5, 7, and 10.
- Produces: operator setup instructions, the endpoint reference, the verification report.

- [ ] **Step 1: Write the operator and endpoint documentation**

Create `apps/backend/docs/chat-video-generator.md` containing:

- **Scope:** what this foundation does and, explicitly, the three things it does not do — call a model, render video, or serve the UI. Name the three plans that will.
- **Environment:** every new variable with its default and meaning — `SUPABASE_ASSET_BUCKET`, `VIDEO_MAX_ASSETS_PER_PROJECT`, `VIDEO_MAX_PROJECT_ASSET_BYTES`, `VIDEO_MIN_IMAGE_DIMENSION`, `VIDEO_MAX_IMAGE_DIMENSION`, `AI_PROFILES_JSON`, `AI_TASKS_JSON`, `AI_MAX_CONCURRENCY`, the `AI_9ROUTER_*` variables from Task 1, and the existing `R2_*` variables that `ai_assets` still uses. State that `apps/backend/Makefile`'s `env:` target copies these from `../app/.env`.
- **Endpoint reference:** one row per route — method, path, auth, request shape, response shape, and the error codes it can return.
- **State machine:** the project statuses and the allowed transitions, including the deliberate `revision_draft → awaiting_approval → approved → rendering` realisation of the PRD diagram.
- **Revision quota rules:** what consumes a rerender (`beginRenderJob` on a job whose `parentVersionId` is set), what does not (a system failure, a cancellation while queued), and what the user sees when the quota is spent.
- **Deletion semantics:** rows are soft deleted first, objects are removed best effort, and `pendingObjectDeletions` reports what a reconciliation pass still has to remove. State the retention and backup policy is still **TBD** in the PRD.
- **Storage:** the private `video-assets` bucket, the object key conventions for assets and versions, and the rule that signed URLs are generated per request and never stored.
- **Not yet wired:** moderation status starts at `pending`; the AI orchestration plan must gate on `allowed`. Multi-image analysis is not implemented. The `/responses` API format has no adapter.

- [ ] **Step 2: Fix the stale environment reference in the AI service documentation**

`apps/backend/docs/ai-provider-service.md` line 9 tells operators to copy variables from `.env.example`, which does not exist. Replace that sentence with a pointer to the `env:` target in `apps/backend/Makefile` and to `apps/backend/docs/chat-video-generator.md`, and add `openai-chat-completions` to the list of registered API formats on line 14.

- [ ] **Step 3: Run the focused suites**

Run: `pnpm --filter backend test -- src/domain/video src/application/video src/application/ai-service src/infrastructure/video src/infrastructure/ai-service src/schemas/video.test.ts src/routes/video.test.ts src/routes/ai.test.ts`

Expected: PASS with no warnings and no network traffic outside loopback.

- [ ] **Step 4: Run the full backend suite and coverage**

Run: `pnpm --filter backend test`

Run: `pnpm backend:test:coverage`

Expected: PASS, and coverage stays at or above the 80% thresholds configured in `apps/backend/vitest.config.mts`. Every new module under `src/domain/video` and `src/application/video` is inside the coverage include list and outside the exclude list, so a missing `*.test.ts` shows up as a threshold failure — fix it here rather than excluding the file.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm backend:build`

Expected: PASS. `apps/backend` uses `tsc --noEmit` as both its `build` and `lint` script, so this is the whole static check.

- [ ] **Step 6: Verify the migrations against a real database, or report honestly that you could not**

Run: `make -C apps/backend supabase-up` then `make -C apps/backend migrate-fresh`

Expected: the four new migrations apply cleanly on top of the existing ones and the reset completes without errors. If Docker or the Supabase CLI is unavailable, do not claim success: record "NOT RUN — <reason>" in the report. If the migrations apply, also confirm by hand that `select relname, relrowsecurity from pg_class where relname like 'video_%'` reports `relrowsecurity = true` for every video table.

- [ ] **Step 7: Verify ownership isolation**

Confirm by reading the diff, and record the finding, that every `video_*` query in `apps/backend/src/infrastructure/video` filters on `user_id`, that no route reads an identifier from a request body for ownership, and that every `video_*` route is registered with `{ auth: true }`.

- [ ] **Step 8: Verify no secrets or payloads leak into logs or responses**

Confirm and record that: no `console.log` in the new code prints a request body, prompt, signed URL, image byte, or API key; every client-facing message comes from a `VideoError` message constant; and no response shape contains `objectKey`, `outputObjectKey`, or `inputSnapshot` verbatim.

- [ ] **Step 9: Update the knowledge graph**

Run: `graphify update .`

Expected: the graph updates. Dirty `graphify-out` output is expected and is not a failure.

- [ ] **Step 10: Report**

Read `git status` and the complete diff, and report exactly:

- Summary of what was built.
- Files created and modified.
- Validation performed, with the actual outcome of each command.
- The three decision records and the one-line answer each one settled.
- Fixture versus live integration status: state plainly which provider calls were exercised against a live endpoint and which were `NOT RUN`.
- Every deferred item from the "Scope Of This Plan" section, so the next plan's author can find it.
- Risks and follow-ups, including anything the spikes turned up that contradicts the PRD.

- [ ] **Step 11: Commit if authorized**

```bash
git add apps/backend/docs docs/decisions docs/superpowers/plans/2026-09-21-chat-video-generator-backend-foundation.md
git commit -m "docs: document the chat video generator backend"
```
