# AI Provider Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-only provider-agnostic AI service for text, one owned product image, and runtime-validated structured output, then migrate the existing Gemini callers to it.

**Architecture:** Add isolated `domain/ai-service`, `application/ai-service`, and `infrastructure/ai-service` modules. Application orchestration resolves immutable task/profile snapshots and depends on domain contracts; infrastructure supplies an explicit Gemini `generateContent` adapter, private R2 asset access, and Supabase usage persistence independent from the removable video flow.

**Tech Stack:** TypeScript 5, Next.js 16.2.9 server routes, Zod 4.4.3, Vitest 3.2.4, Supabase/PostgreSQL, AWS S3 client for Cloudflare R2, native `fetch`/AbortSignal.

**Spec:** `docs/superpowers/specs/2026-09-12-ai-provider-service-design.md`

## Global Constraints

- Use pnpm only and read relevant installed Next.js docs before route changes.
- Follow `UI/routes/actions -> application -> domain <- infrastructure`; application cannot import infrastructure.
- New code is independent of `ai_projects`, `ai_scenes`, `ai_generations`, Atlas, credit reservation, and the video worker.
- Provider/model/base URL/API key/timeouts/pricing are server configuration, never browser request fields.
- Initial API-format ID is exactly `google-generate-content`; never infer adapters from URLs or provider labels.
- One product image maximum; JPEG/PNG/WebP; maximum 10 MB or a lower configured limit.
- Defaults are 30 seconds per attempt, 65 seconds total, and two total attempts.
- Retry only explicit rate limits and known transient service responses; never retry ambiguous timeout/network outcomes.
- Never persist or log prompts, responses, schemas, image bytes/base64, signed URLs, raw provider payloads, or secrets.
- Missing usage/cost values are `null`/incomplete, never zero.
- Live smoke tests require explicit authorization and never run in normal tests/startup/health checks.
- Every production behavior uses strict red-green-refactor TDD; read the TDD skill's `writing-good-tests.md` before editing tests.
- Do not commit unless the user explicitly requests commits; ignore commit steps below when executing without that permission.

---

### Task 1: Provider-Neutral Domain Contract

**Files:**
- Create: `apps/app/domain/ai-service/types.ts`
- Create: `apps/app/domain/ai-service/errors.ts`
- Create: `apps/app/domain/ai-service/contracts.ts`
- Test: `apps/app/domain/ai-service/types.test.ts`
- Test: `apps/app/domain/ai-service/errors.test.ts`

**Interfaces:**
- Consumes: Zod `ZodType<T>`.
- Produces: `AITask`, `AIMessage`, `AIContext`, `GenerateTextRequest`, `GenerateStructuredRequest<T>`, `TextResult`, `StructuredResult<T>`, `AIUsage`, `EstimatedCost`, `FinishReason`, `AIError`, `AIService`, `ProviderAdapter`, `AssetResolver`, `UsageRecorder`, and provider-neutral attempt types.

- [ ] **Step 1: Read the test-design rules**

Read `/home/siuu/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/test-driven-development/writing-good-tests.md` and name the production change that would make each planned assertion fail.

- [ ] **Step 2: Write failing domain-contract tests**

Add tests that construct both requests, prove message roles are restricted to `user | assistant`, require a named/versioned Zod schema for structured requests, represent absent usage fields as `null`, and prove `AIError` exposes only `code`, `safeMessage`, `requestId`, `retryable`, optional provider status/request ID, and an internal sanitized diagnostic.

```ts
it("preserves unknown provider usage as null", () => {
  const usage: AIUsage = {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  };
  expect(usage.totalTokens).toBeNull();
});

it("creates a normalized safe error", () => {
  const error = new AIError({
    code: "AI_AUTH_ERROR",
    safeMessage: "AI provider authentication failed",
    requestId: "request-1",
    retryable: false,
    providerStatus: 401,
  });
  expect(error).toMatchObject({ code: "AI_AUTH_ERROR", retryable: false });
});
```

- [ ] **Step 3: Verify RED**

Run: `pnpm --filter app test -- domain/ai-service/types.test.ts domain/ai-service/errors.test.ts`

Expected: FAIL because the `domain/ai-service` modules do not exist.

- [ ] **Step 4: Implement the minimal contracts**

Define the exact task union:

```ts
export type AITask =
  | "connection_test"
  | "interviewer"
  | "planner"
  | "product_analysis";
```

Define result metadata with `profileId`, `provider`, `model`, `providerRequestId`, `attemptCount`, `finishReason`, `usage`, `estimatedCost`, and `latencyMs`. Define `AIErrorCode` with all ten required codes. Keep adapter inputs resolved and provider-neutral, including bytes for one optional asset and one attempt signal. Contracts must not import infrastructure or video-domain types.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter app test -- domain/ai-service/types.test.ts domain/ai-service/errors.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit if authorized**

```bash
git add apps/app/domain/ai-service
git commit -m "feat: define ai service contracts"
```

### Task 2: Connection And Task Configuration

**Files:**
- Create: `apps/app/domain/ai-service/config.ts`
- Create: `apps/app/application/ai-service/resolve-config.ts`
- Test: `apps/app/application/ai-service/resolve-config.test.ts`

**Interfaces:**
- Consumes: `AITask`, registered API-format IDs, an environment lookup function.
- Produces: `ConnectionProfile`, `TaskConfig`, `ResolvedAIConfig`, `resolveAIConfig(task, options)`, and `checkAIConfig(options)`.

- [ ] **Step 1: Write failing configuration tests**

Cover a valid primary profile, two tasks using different profiles, explicit smoke profile override restricted to registered IDs, compatible endpoint/model/key switching, missing secret/model, unknown adapter/task/profile, HTTP/non-HTTPS URL, URL credentials/query/fragment, invalid limits/deadlines, task limits that loosen profile limits, and pricing without version/source/currency.

```ts
it("resolves one immutable profile snapshot", () => {
  const env = new Map([
    ["AI_PRIMARY_API_KEY", "secret-a"],
    ["AI_PRIMARY_MODEL_ID", "gemini-model-a"],
  ]);
  const resolved = resolveAIConfig("planner", fixtureOptions(env));
  env.set("AI_PRIMARY_MODEL_ID", "gemini-model-b");
  expect(resolved.modelId).toBe("gemini-model-a");
});

it("rejects unknown formats before networking", () => {
  expect(() => resolveAIConfig("planner", fixtureOptionsWithFormat("guessed")))
    .toThrowError(expect.objectContaining({ code: "AI_CONFIG_ERROR" }));
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter app test -- application/ai-service/resolve-config.test.ts`

Expected: FAIL because configuration resolution is missing.

- [ ] **Step 3: Implement schemas and immutable resolution**

Use Zod to validate profiles/tasks. Normalize `baseUrl` with a single trailing-slash policy, require HTTPS, prohibit username/password/query/fragment, and retain the API key only in the operation snapshot. `checkAIConfig` runs the same parsing for all active task mappings but never resolves an adapter by URL or calls `fetch`.

Define profile defaults exactly as 30,000 ms per attempt, 65,000 ms total, and two attempts. Task limits can only lower character/output/image/concurrency bounds.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter app test -- application/ai-service/resolve-config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if authorized**

```bash
git add apps/app/domain/ai-service/config.ts apps/app/application/ai-service
git commit -m "feat: resolve ai connection profiles"
```

### Task 3: Request Validation And Capability Enforcement

**Files:**
- Create: `apps/app/application/ai-service/validate-request.ts`
- Test: `apps/app/application/ai-service/validate-request.test.ts`

**Interfaces:**
- Consumes: `GenerateTextRequest`, `GenerateStructuredRequest<T>`, `ResolvedAIConfig`.
- Produces: `validateTextRequest(request, config)` and `validateStructuredRequest(request, config)` returning cloned validated requests.

- [ ] **Step 1: Write failing request tests**

Test empty instructions/messages, whitespace-only content, unsupported roles at runtime, excessive total characters, excessive requested output, two image references, image in an assistant message, missing user ID/request ID/prompt version, unsupported text/vision/native structured capability, and preservation of message order. Mutate the original arrays after validation and prove the validated snapshot does not change.

```ts
it("rejects vision before an adapter call when unsupported", () => {
  expect(() => validateTextRequest(requestWithAsset("asset-1"), textOnlyConfig))
    .toThrowError(expect.objectContaining({ code: "AI_CAPABILITY_UNSUPPORTED" }));
});

it("clones ordered history", () => {
  const messages = [user("first"), assistant("second")];
  const value = validateTextRequest(makeRequest({ messages }), config);
  messages[0].content = "changed";
  expect(value.messages.map((item) => item.content)).toEqual(["first", "second"]);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter app test -- application/ai-service/validate-request.test.ts`

Expected: FAIL because validators are missing.

- [ ] **Step 3: Implement minimal validation**

Return normalized cloned data; never trim content silently except to test emptiness. Count instructions plus all message text against the effective task limit. Require exactly zero or one unique asset reference and enforce that it appears only on a user message. Capability failures use `AI_CAPABILITY_UNSUPPORTED`; malformed input uses `AI_INPUT_INVALID`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter app test -- application/ai-service/validate-request.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if authorized**

```bash
git add apps/app/application/ai-service/validate-request.ts apps/app/application/ai-service/validate-request.test.ts
git commit -m "feat: validate ai service requests"
```

### Task 4: Owned Asset Registry And Image Validation

**Files:**
- Create: `apps/app/domain/ai-service/assets.ts`
- Create: `apps/app/application/ai-service/register-asset.ts`
- Create: `apps/app/application/ai-service/resolve-asset.ts`
- Create: `apps/app/infrastructure/ai-service/supabase-asset-repository.ts`
- Create: `apps/app/infrastructure/ai-service/r2-object-store.ts`
- Create: `apps/app/supabase/migrations/20260912000000_create_ai_service_assets.sql`
- Modify: `apps/app/infrastructure/supabase/database.types.ts`
- Modify: `apps/app/app/api/ai/assets/route.ts`
- Test: `apps/app/application/ai-service/register-asset.test.ts`
- Test: `apps/app/application/ai-service/resolve-asset.test.ts`
- Test: `apps/app/infrastructure/ai-service/supabase-asset-repository.test.ts`
- Test: `apps/app/app/api/ai/assets/route.test.ts`

**Interfaces:**
- Consumes: authenticated `userId`, upload bytes, R2 configuration, Supabase service-role client.
- Produces: `AssetRepository`, `AssetObjectStore`, `registerAsset`, `resolveOwnedAsset`, and route response `{ asset: { id, mimeType, byteSize, width, height } }`.

- [ ] **Step 1: Write failing pure asset-validation tests**

Use tiny valid JPEG, PNG, and WebP byte fixtures. Test signature-based MIME detection, decoded dimensions, 10 MB limit, malformed/truncated bytes, header/content mismatch, and rejected GIF/SVG. Test ownership query by both `assetId` and `userId`, missing/deleted/unvalidated metadata, changed object bytes, and configured lower provider limits.

```ts
it("rejects an asset owned by another user before provider use", async () => {
  repository.getOwned.mockResolvedValue(null);
  await expect(resolveOwnedAsset({ assetId: "asset-1", userId: "user-b" }, deps))
    .rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  expect(objectStore.read).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter app test -- application/ai-service/register-asset.test.ts application/ai-service/resolve-asset.test.ts`

Expected: FAIL because asset contracts/use cases are missing.

- [ ] **Step 3: Implement format parsing and use cases**

Implement focused parsers for JPEG SOF dimensions, PNG IHDR, and WebP VP8/VP8L/VP8X dimensions without adding an image dependency. Detect MIME from magic bytes. Register only after validation and successful private object write; on metadata insert failure, attempt best-effort object deletion. Resolve by owner, read the stored key only, and revalidate bytes against persisted metadata and effective limits.

- [ ] **Step 4: Verify pure tests GREEN**

Run: `pnpm --filter app test -- application/ai-service/register-asset.test.ts application/ai-service/resolve-asset.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing migration/repository/route tests**

Assert snake_case to camelCase mapping, owner-qualified Supabase query, private object key creation, no public/signed URL in results, authenticated route behavior, one file only, and user-safe errors. The SQL migration must enable RLS, revoke `anon`/`authenticated`, grant service role, constrain supported MIME/positive dimensions/10 MB, and index `(user_id, created_at)`.

- [ ] **Step 6: Verify infrastructure RED**

Run: `pnpm --filter app test -- infrastructure/ai-service/supabase-asset-repository.test.ts app/api/ai/assets/route.test.ts`

Expected: FAIL because repository wiring and new route contract are missing.

- [ ] **Step 7: Implement migration, repository, R2 store, and route**

Use `GetObjectCommand`, `PutObjectCommand`, and `DeleteObjectCommand`. Keep R2 endpoint/operator config server-only. Update `database.types.ts` with `ai_assets`. Read the installed Next.js route-handler docs before modifying `route.ts`, retain existing auth helper usage, and return only safe metadata and the internal ID.

- [ ] **Step 8: Verify infrastructure GREEN**

Run: `pnpm --filter app test -- infrastructure/ai-service/supabase-asset-repository.test.ts app/api/ai/assets/route.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit if authorized**

```bash
git add apps/app/domain/ai-service/assets.ts apps/app/application/ai-service apps/app/infrastructure/ai-service apps/app/supabase/migrations/20260912000000_create_ai_service_assets.sql apps/app/infrastructure/supabase/database.types.ts apps/app/app/api/ai/assets
git commit -m "feat: register owned ai assets"
```

### Task 5: Gemini GenerateContent Adapter

**Files:**
- Create: `apps/app/infrastructure/ai-service/google-generate-content-adapter.ts`
- Create: `apps/app/infrastructure/ai-service/google-generate-content-adapter.test.ts`
- Create: `apps/app/infrastructure/ai-service/http-fixture-server.test.ts`

**Interfaces:**
- Consumes: resolved provider-neutral adapter request with API key/model/base URL, ordered messages, optional validated bytes, optional native schema, output-token limit, and attempt signal.
- Produces: `GoogleGenerateContentAdapter implements ProviderAdapter` with normalized text, finish reason, provider request ID, usage, status, retry-after, and safe provider failures.

- [ ] **Step 1: Verify official API contract**

Read current official Gemini REST documentation for `models.generateContent`, `systemInstruction`, roles/parts, `inlineData`, JSON/schema response configuration, `usageMetadata`, finish/refusal reasons, request IDs, error status mapping, and redirects. Record verified field names and supported model requirements in the adapter README comments/tests; do not infer them from the existing implementation.

- [ ] **Step 2: Write failing HTTP fixture tests**

Start local HTTP servers on ephemeral ports. Assert exact operation path construction without `/v1/v1`, API key placement according to official docs, model encoding, distinct system instructions, ordered user/model messages, inline image data, native structured configuration, output-token limit, `redirect: "manual"`, and forwarded abort signal. Run two servers/profiles with different keys/models and prove no cross-profile leakage.

```ts
it("routes two profiles without leaking credentials or models", async () => {
  await adapter.generate(profileARequest);
  await adapter.generate(profileBRequest);
  expect(serverA.lastRequest()).toMatchObject({ key: "key-a", model: "model-a" });
  expect(serverB.lastRequest()).toMatchObject({ key: "key-b", model: "model-b" });
});
```

Test response normalization for text success, structured JSON text, missing usage as null, provider request ID, refusal, max-token truncation, empty candidate, malformed JSON body, 400, 401/403, 429 with seconds/date `Retry-After`, 5xx, and unexpected redirects.

- [ ] **Step 3: Verify RED**

Run: `pnpm --filter app test -- infrastructure/ai-service/google-generate-content-adapter.test.ts infrastructure/ai-service/http-fixture-server.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement minimal adapter**

Build the operation URL from validated base path plus the documented path once. Use native `fetch` with zero SDK retries. Map only documented temporary statuses as retryable, represent response/usage omissions as null, sanitize error messages, and never return raw response bodies. Keep schema conversion isolated and reject unsupported Zod constructs with `AI_CONFIG_ERROR` before fetch rather than silently weakening the schema.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter app test -- infrastructure/ai-service/google-generate-content-adapter.test.ts infrastructure/ai-service/http-fixture-server.test.ts`

Expected: PASS with no network outside loopback.

- [ ] **Step 6: Commit if authorized**

```bash
git add apps/app/infrastructure/ai-service/google-generate-content-adapter.ts apps/app/infrastructure/ai-service/google-generate-content-adapter.test.ts apps/app/infrastructure/ai-service/http-fixture-server.test.ts
git commit -m "feat: add gemini ai service adapter"
```

### Task 6: Usage Recorder And Cost Aggregation

**Files:**
- Create: `apps/app/domain/ai-service/usage.ts`
- Create: `apps/app/application/ai-service/calculate-cost.ts`
- Create: `apps/app/infrastructure/ai-service/supabase-usage-recorder.ts`
- Create: `apps/app/supabase/migrations/20260912001000_create_ai_service_usage.sql`
- Modify: `apps/app/infrastructure/supabase/database.types.ts`
- Test: `apps/app/application/ai-service/calculate-cost.test.ts`
- Test: `apps/app/infrastructure/ai-service/supabase-usage-recorder.test.ts`

**Interfaces:**
- Consumes: operation/attempt lifecycle records and optional versioned pricing.
- Produces: `calculateAttemptCost`, `aggregateOperationUsage`, and `SupabaseUsageRecorder`.

- [ ] **Step 1: Write failing cost and aggregation tests**

Test input/output token pricing, all attempts included, null usage fields, absent pricing, unknown cached/reasoning/image dimensions, one unknown attempt making total incomplete, decimal rounding only at persistence boundaries, and zero tokens distinguished from unknown tokens.

```ts
it("marks operation cost incomplete when one attempt is unknown", () => {
  expect(aggregateOperationUsage([knownAttempt, ambiguousAttempt], pricing))
    .toMatchObject({ estimatedCost: null, costComplete: false });
});
```

- [ ] **Step 2: Verify cost RED**

Run: `pnpm --filter app test -- application/ai-service/calculate-cost.test.ts`

Expected: FAIL because cost functions are missing.

- [ ] **Step 3: Implement minimal cost functions**

Calculate only configured documented input/output token dimensions. Preserve nulls; return a version/source/currency only with a valid amount; include every attempt in aggregate usage.

- [ ] **Step 4: Verify cost GREEN**

Run: `pnpm --filter app test -- application/ai-service/calculate-cost.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing recorder and migration tests**

Assert camelCase/snake_case mapping, operation start/finalize, attempt start/finalize, request/attempt uniqueness, sanitized diagnostic length, null fields, unknown billing flags, and absence of prompt/response/schema/image/secret columns. Check migration RLS/revokes/service-role grants and indexes for request, task/user/status/timestamp.

- [ ] **Step 6: Verify recorder RED**

Run: `pnpm --filter app test -- infrastructure/ai-service/supabase-usage-recorder.test.ts`

Expected: FAIL because persistence is missing.

- [ ] **Step 7: Implement migration and recorder**

Create `ai_service_operations` and `ai_service_attempts` without foreign keys to old AI/video tables. A UUID request ID is the operation primary key; attempts reference only the operation. Enable RLS, deny direct browser roles, grant service role, and update generated-style database types.

- [ ] **Step 8: Verify recorder GREEN**

Run: `pnpm --filter app test -- infrastructure/ai-service/supabase-usage-recorder.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit if authorized**

```bash
git add apps/app/domain/ai-service/usage.ts apps/app/application/ai-service/calculate-cost.ts apps/app/infrastructure/ai-service/supabase-usage-recorder.ts apps/app/supabase/migrations/20260912001000_create_ai_service_usage.sql apps/app/infrastructure/supabase/database.types.ts
git commit -m "feat: record ai provider usage"
```

### Task 7: AIService Orchestration, Retry, Cancellation, And Concurrency

**Files:**
- Create: `apps/app/application/ai-service/ai-service.ts`
- Create: `apps/app/application/ai-service/concurrency-limiter.ts`
- Test: `apps/app/application/ai-service/ai-service.test.ts`
- Test: `apps/app/application/ai-service/concurrency-limiter.test.ts`

**Interfaces:**
- Consumes: config resolver, adapter registry, `AssetResolver`, `UsageRecorder`, clock/sleep/random dependencies, and validators.
- Produces: `DefaultAIService implements AIService` and `ConcurrencyLimiter`.

- [ ] **Step 1: Write failing success/output tests**

Test text success metadata, structured JSON plus Zod validation, asset resolved once before attempts, provider/model/profile result fields, total latency, request ID preservation, actual attempt count, refusal, truncation, empty output, invalid JSON, and schema mismatch. Prove no structured repair call occurs.

- [ ] **Step 2: Verify success RED**

Run: `pnpm --filter app test -- application/ai-service/ai-service.test.ts -t "success|structured|refusal|truncated|invalid"`

Expected: FAIL because orchestration is missing.

- [ ] **Step 3: Implement one-attempt orchestration**

Start the durable operation record before adapter invocation, validate config/request/capabilities, resolve one asset, invoke the adapter, reject non-success finish reasons, validate structured output, aggregate usage/cost, finalize records, and throw normalized errors. If operation-start persistence fails, perform no network call. If final recording fails, preserve the original AI outcome and emit only a sanitized server diagnostic.

- [ ] **Step 4: Verify success GREEN**

Run the same focused command; expected PASS.

- [ ] **Step 5: Write failing retry/deadline tests**

With injected fake clock/sleep/random, test one retry for 429/transient 5xx, bounded seconds/date `Retry-After`, exponential jitter fallback, maximum two attempts, insufficient remaining deadline preventing retry, no retry for config/input/capability/auth/refusal/schema errors, immutable profile across retry, and per-attempt usage records.

- [ ] **Step 6: Verify retry RED**

Run: `pnpm --filter app test -- application/ai-service/ai-service.test.ts -t "retry|deadline|attempt"`

Expected: FAIL because retry scheduling is missing.

- [ ] **Step 7: Implement bounded retry**

Service owns retries; adapters receive `attemptNumber` but never retry. Combine attempt timeout with total deadline. Retry only explicit `retryable && dispatchOutcome === "rejected"`; mark post-dispatch timeout/network failures `ambiguous`, record unknown usage/billing, and stop.

- [ ] **Step 8: Verify retry GREEN**

Run the focused retry command; expected PASS.

- [ ] **Step 9: Write failing cancellation and concurrency tests**

Test abort before start, while waiting for a permit, during adapter fetch, and during backoff. Test configured maximum concurrent operations, permit release after success/error/cancel, waiting time included in total deadline, and no future retry after abort.

- [ ] **Step 10: Verify cancellation RED**

Run: `pnpm --filter app test -- application/ai-service/concurrency-limiter.test.ts application/ai-service/ai-service.test.ts -t "cancel|concurr|abort"`

Expected: FAIL because cancellation-aware semaphore behavior is missing.

- [ ] **Step 11: Implement cancellation-aware limiter**

Use a FIFO queue of waiters with abort listeners. Combine external, attempt-timeout, and deadline signals without leaking timers/listeners. Map caller abort to `AI_CANCELLED`, per-attempt timeout to `AI_TIMEOUT`, and total deadline exhaustion to `AI_TIMEOUT`, preserving ambiguous dispatch metadata when applicable.

- [ ] **Step 12: Verify complete orchestration GREEN**

Run: `pnpm --filter app test -- application/ai-service/ai-service.test.ts application/ai-service/concurrency-limiter.test.ts`

Expected: PASS with deterministic fake time and no real delay.

- [ ] **Step 13: Commit if authorized**

```bash
git add apps/app/application/ai-service/ai-service.ts apps/app/application/ai-service/concurrency-limiter.ts apps/app/application/ai-service/*.test.ts
git commit -m "feat: orchestrate reliable ai requests"
```

### Task 8: Server Factory And Configuration Check CLI

**Files:**
- Create: `apps/app/infrastructure/ai-service/config.ts`
- Create: `apps/app/infrastructure/ai-service/create-ai-service.ts`
- Create: `apps/app/scripts/ai-service.ts`
- Create: `apps/app/infrastructure/ai-service/create-ai-service.test.ts`
- Modify: `apps/app/package.json`
- Create: `apps/app/.env.example`

**Interfaces:**
- Consumes: environment variables, service-role client, R2 client, adapter registry.
- Produces: `createAIService()`, `checkConfiguredAIService()`, and scripts `ai:check-config`, `ai:smoke:text`, `ai:smoke:structured`, `ai:smoke:vision`.

- [ ] **Step 1: Write failing factory/config-check tests**

Mock `server-only` and inject environment/fetch. Assert singleton process-local limiter, explicit adapter registration, no imports from Atlas/video modules, all task mappings, missing active credential failure, optional unused profile without credential, and zero `fetch` calls during check. Assert smoke profile override accepts registered IDs only.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter app test -- infrastructure/ai-service/create-ai-service.test.ts`

Expected: FAIL because factory/config do not exist.

- [ ] **Step 3: Implement environment-backed wiring**

Use explicit variables documented in `.env.example`, including profile base URL, key env name/key value, model, capabilities, limits, task mappings, concurrency, and optional pricing metadata. Keep the real API key server-only and out of errors. Register only `google-generate-content`. Build service-role repositories and private R2 reader through existing client helpers.

- [ ] **Step 4: Implement explicit CLI behavior**

Use a TypeScript execution mechanism already available in the workspace; if none exists, add `tsx` as an app dev dependency using pnpm. `check-config` prints only profile/task/model/provider labels and validation status. Smoke commands print a token-cost warning, require explicit command selection, use fresh request IDs, and require `AI_SMOKE_USER_ID` plus `AI_SMOKE_ASSET_ID` for vision. They never print prompts, image data, or secrets.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter app test -- infrastructure/ai-service/create-ai-service.test.ts`

Expected: PASS.

Run: `pnpm --filter app ai:check-config`

Expected with fixture/non-secret config: PASS and no network request. Expected without required active variables: exit non-zero with `AI_CONFIG_ERROR` and no secret values.

- [ ] **Step 6: Commit if authorized**

```bash
git add apps/app/infrastructure/ai-service/config.ts apps/app/infrastructure/ai-service/create-ai-service.ts apps/app/infrastructure/ai-service/create-ai-service.test.ts apps/app/scripts/ai-service.ts apps/app/package.json apps/app/.env.example pnpm-lock.yaml
git commit -m "feat: configure ai service runtime"
```

### Task 9: Migrate Analyze And Storyboard Callers

**Files:**
- Modify: `apps/app/app/api/ai/analyze/route.ts`
- Create or modify: `apps/app/app/api/ai/analyze/route.test.ts`
- Modify: `apps/app/app/api/ai/projects/storyboard/route.ts`
- Create or modify: `apps/app/app/api/ai/projects/storyboard/route.test.ts`
- Modify: `apps/app/app/api/ai/_shared.ts`
- Modify: `apps/app/app/api/ai/_shared.test.ts`
- Delete provider use only after tests pass: direct `GoogleGeminiTextProvider` contract/class references from `apps/app/domain/ai/providers.ts` and `apps/app/infrastructure/ai/providers.ts`

**Interfaces:**
- Consumes: `createAIService()`, authenticated user ID, internal asset IDs, existing `productSchema` and `storyboardSchema`.
- Produces: unchanged successful response shapes and stable safe normalized error responses.

- [ ] **Step 1: Read installed Next.js route docs**

Read the applicable files under `apps/app/node_modules/next/dist/docs/` for route handlers, request parsing, runtime, and async route params. Match Next.js 16.2.9 behavior rather than assumptions.

- [ ] **Step 2: Write failing analyze route tests**

Test authentication, request body `{ assetId }`, UUID/request ID generation, task `product_analysis`, prompt version, server-owned product schema/instructions, authenticated context user, no browser-controlled provider/model/schema, unchanged `{ product }` success, owned-asset rejection, and safe `AIError` mapping. Assert there is no direct provider import or multipart/base64 path.

- [ ] **Step 3: Verify analyze RED**

Run: `pnpm --filter app test -- app/api/ai/analyze/route.test.ts app/api/ai/_shared.test.ts`

Expected: FAIL because analyze still calls Gemini directly and accepts multipart files.

- [ ] **Step 4: Migrate analyze minimally**

Resolve the authenticated user, validate `{ assetId: z.string().uuid() }`, call `generateStructured` with one user message referencing that asset, use the existing business prompt and `productSchema`, and return `{ product: result.data }`. Extend shared error mapping for all normalized AI codes without exposing diagnostic/provider bodies.

- [ ] **Step 5: Verify analyze GREEN**

Run the same command; expected PASS.

- [ ] **Step 6: Write failing storyboard tests**

Test task `planner`, authenticated user/project trace context, prompt version, existing schema/instructions/messages, unchanged persistence/public success behavior, normalized safe failures, and no provider adapter import. Existing video-generation behavior outside the provider call must remain untouched.

- [ ] **Step 7: Verify storyboard RED**

Run: `pnpm --filter app test -- app/api/ai/projects/storyboard/route.test.ts`

Expected: FAIL because storyboard imports `GoogleGeminiTextProvider`.

- [ ] **Step 8: Migrate storyboard minimally**

Inject/use `AIService`, call `generateStructured` with `planner` and `storyboardSchema`, and adapt `result.data` to existing normalization/persistence. Keep all business prompt construction in the caller. Remove only the obsolete Gemini text interface/class after repository-wide search confirms no references remain; retain Atlas types/classes untouched.

- [ ] **Step 9: Verify caller migration GREEN**

Run: `pnpm --filter app test -- app/api/ai/analyze/route.test.ts app/api/ai/projects/storyboard/route.test.ts app/api/ai/_shared.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit if authorized**

```bash
git add apps/app/app/api/ai apps/app/domain/ai/providers.ts apps/app/infrastructure/ai/providers.ts
git commit -m "refactor: route gemini calls through ai service"
```

### Task 10: Documentation, Acceptance Fixtures, And Full Verification

**Files:**
- Create: `apps/app/docs/ai-provider-service.md`
- Modify: `apps/app/README.md`
- Modify: `apps/app/.env.example`
- Test: all new and affected test files

**Interfaces:**
- Consumes: completed service, scripts, environment contract.
- Produces: operator setup, caller examples, endpoint/model switch example, fixture/live status report format, and verified repository state.

- [ ] **Step 1: Write documentation acceptance assertions**

Add a small Vitest file or package-script test that reads `.env.example`/docs and asserts required variable names exist, no literal known secret patterns are present, all four task names are documented, live commands are explicit, and deletion independence is stated.

- [ ] **Step 2: Verify documentation RED**

Run the focused documentation test.

Expected: FAIL because setup/caller documentation is incomplete.

- [ ] **Step 3: Write operator and caller documentation**

Document:

- Profile fields and required env names without values.
- Restart/redeploy requirement after env changes.
- Compatible endpoint/key/model switch without caller edits.
- New API format requiring a new registered adapter.
- `generateText` and `generateStructured` server-only examples.
- Asset upload/register then `assetId` usage.
- `ai:check-config` versus paid smoke commands.
- Fixture tests versus live integration status.
- No dependency on/removal procedure for old video flow.

- [ ] **Step 4: Verify documentation GREEN**

Run the focused documentation test; expected PASS.

- [ ] **Step 5: Run focused AI service tests**

Run: `pnpm --filter app test -- domain/ai-service application/ai-service infrastructure/ai-service app/api/ai`

Expected: PASS, no warnings, no external network calls.

- [ ] **Step 6: Run complete app tests**

Run: `pnpm --filter app test`

Expected: PASS.

- [ ] **Step 7: Run lint**

Run: `pnpm app:lint`

Expected: PASS with no errors.

- [ ] **Step 8: Run build/type validation**

Run: `pnpm app:build`

Expected: PASS. If build requires unavailable public environment variables, run the repository's existing typecheck alternative and report the exact build blocker rather than claiming success.

- [ ] **Step 9: Run offline config check**

Run: `pnpm --filter app ai:check-config` with complete non-secret local fixture configuration pointing to a loopback URL.

Expected: PASS and fixture instrumentation confirms zero HTTP requests.

- [ ] **Step 10: Verify old video-flow independence**

Use dependency search to confirm new `ai-service` modules and new SQL tables do not import/reference `ai_projects`, `ai_scenes`, `ai_generations`, Atlas, credits, or worker modules. Existing migrated callers may still perform their own video-flow persistence, but the service factory and contracts must load without those modules.

- [ ] **Step 11: Update the knowledge graph**

Run: `graphify update .` from `apps/app`.

Expected: graph update succeeds; dirty `graphify-out` output is allowed.

- [ ] **Step 12: Handle live smoke tests honestly**

Do not run paid calls without explicit authorization. If authorized and valid credentials/test asset exist, run individually:

```bash
pnpm --filter app ai:smoke:text
pnpm --filter app ai:smoke:structured
pnpm --filter app ai:smoke:vision
```

Record each result independently. Otherwise report all as `NOT RUN` and do not imply provider/model compatibility was proven live.

- [ ] **Step 13: Review final diff and report**

Inspect `git status`, `git diff --check`, and the complete diff. Report exactly:

- Summary of changes.
- Files changed.
- Validation performed and actual outcomes.
- Rule compliance notes.
- Fixture integration status.
- Live integration status.
- Risks or follow-up items.

- [ ] **Step 14: Commit if authorized**

```bash
git add apps/app docs/superpowers/specs/2026-09-12-ai-provider-service-design.md docs/superpowers/plans/2026-09-12-ai-provider-service.md pnpm-lock.yaml
git commit -m "feat: implement provider-agnostic ai service"
```
