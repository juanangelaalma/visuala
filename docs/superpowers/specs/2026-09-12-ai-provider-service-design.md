# AI Provider Service Design

Date: 2026-09-12

## Purpose

Build a backend-only, provider-agnostic entry point for text, conversation,
single-product-image, and schema-validated AI requests in `apps/app`. The
service will support future interviewer and planner callers and will replace
the current direct Gemini dependency in the existing analyze and storyboard
routes without changing their public response shapes.

This foundation is independent of the unfinished image/video generation flow.
It must continue to work if `ai_projects`, `ai_scenes`, `ai_generations`, Atlas
adapters, video routes, credit reservation, and the AI worker are removed.

## Scope

The implementation includes:

- `AIService.generateText` and `AIService.generateStructured`.
- Named connection profiles and task-to-profile mapping.
- One real Google Gemini `generateContent` REST adapter.
- Text instructions, ordered message history, and at most one owned image.
- Runtime validation of structured output with a caller-owned Zod schema.
- Normalized errors, timeout, cancellation, bounded retry, and concurrency.
- Durable operation and per-attempt usage records.
- An owned product-asset registry backed by private R2 objects.
- Offline configuration checks, deterministic fixtures, and explicit live
  smoke-test commands.
- Migration of the existing analyze and storyboard callers to `AIService`.

The implementation excludes streaming, provider fallback, tool calling,
business prompts for the future interviewer/planner, image/video/audio
generation, customer credit charging, and generic browser-configurable AI
endpoints.

## Existing Context

The repository already contains:

- Next.js 16.2.9, TypeScript, Zod 4, Vitest, Supabase, and R2 dependencies.
- A direct `GoogleGeminiTextProvider` using Gemini `generateContent` for
  structured product analysis and storyboard generation.
- Storyboard and video-specific AI domain types, Atlas adapters, R2 output
  copying, generation tables, and a worker.
- No provider-neutral text service, named connection profiles, normalized AI
  errors, durable technical usage records, or owned internal asset IDs.

The new service uses a separate `ai-service` namespace to avoid making its
contracts depend on the existing video-oriented `domain/ai` module.

## Architecture

### Domain

`domain/ai-service/**` owns stable provider-neutral contracts:

- `AIService` with `generateText` and `generateStructured`.
- Request, message, image-reference, result, usage, cost, and finish-reason
  types.
- `ProviderAdapter`, `AssetResolver`, and `UsageRecorder` interfaces.
- Named task and API-format identifiers.
- `AIError` and the required normalized error codes.

The domain layer does not import Gemini, Supabase, R2, `fetch`, or application
routes. It does not contain interviewer or planner business prompts.

### Application

`application/ai-service/**` implements the orchestration:

- Validate requests and configured limits.
- Resolve one immutable task/profile snapshot per operation.
- Resolve and validate the optional owned asset once per operation.
- Enforce text, vision, and structured-output capabilities before networking.
- Invoke the selected adapter with per-attempt timeout and total deadline.
- Retry only known-safe transient failures.
- Validate structured responses against the runtime Zod schema.
- Normalize result metadata, usage, cost, and errors.
- Record operation and attempt lifecycle events.
- Enforce a simple process-local concurrency limit.

Application code depends only on domain interfaces. Concrete adapters and
repositories are supplied by an infrastructure factory.

### Infrastructure

`infrastructure/ai-service/**` contains:

- An env-backed connection registry and task registry.
- An explicit adapter registry keyed by API-format ID.
- The Gemini `generateContent` HTTP adapter.
- A Supabase asset repository and usage recorder.
- An R2 object reader for internal product images.
- A server-only service factory wiring these components together.

The first API-format ID is `google-generate-content`. This identifies the
specific request, authentication, response, structured-output, image, usage,
and error contract implemented by the adapter. It is not exposed to callers.
No adapter is inferred from a provider label or URL.

## Public Internal Contract

The conceptual contract is:

```ts
interface AIService {
  generateText(request: GenerateTextRequest): Promise<TextResult>;
  generateStructured<T>(
    request: GenerateStructuredRequest<T>,
  ): Promise<StructuredResult<T>>;
}
```

Both requests include:

- `requestId`: caller-supplied trace ID.
- `task`: an allowlisted server-side task name.
- `context.userId`: authenticated user ID.
- `context.projectId`: optional trace context only; the service does not
  depend on the video project table.
- `instructions`: trusted server-authored instructions.
- `messages`: ordered `user` and `assistant` text messages; a user message may
  reference one validated internal `assetId`.
- `promptVersion`: caller-owned prompt version.
- `abortSignal`: optional cancellation signal.

Structured requests additionally include a server-owned schema descriptor
with a stable name, version, and Zod schema. Provider/model/base URL/API key,
timeouts, output limits, and pricing are never request fields.

Results include the original request ID, optional provider request ID,
profile, provider label, actual model, attempt count, normalized finish reason,
total latency, normalized token usage, and optional estimated cost. Text
requests return `text`; structured requests return schema-validated `data`.
Missing token fields are `null`, not zero.

## Connection Profiles And Task Mapping

Profiles are server-controlled records with:

- Stable profile ID.
- Explicit API-format ID.
- Trusted HTTPS base URL.
- API-key environment-variable name, never a literal secret.
- Configured model ID.
- Provider label used for observability and pricing only.
- Capabilities for text, vision, and native structured output.
- Limits for input characters, output tokens, image count, image bytes,
  dimensions, per-attempt timeout, total deadline, and maximum attempts.
- Optional versioned pricing metadata for supported usage dimensions.

Task configuration maps each allowlisted task to exactly one profile and may
tighten, but never loosen, profile limits. Initial tasks are:

- `connection_test` for explicit smoke testing.
- `interviewer` for the future interviewer.
- `planner` for the future planner and the existing storyboard caller.
- `product_analysis` for the existing analyze caller.

The configuration supports multiple profiles but does not perform automatic
fallback. A caller cannot choose a profile, endpoint, key, or model. Test and
smoke tooling may explicitly select only a registered profile.

The registry normalizes the configured base path and lets the adapter append
its operation path once. It rejects non-HTTPS URLs, credentials embedded in
URLs, fragments, query strings, unknown formats, missing models/secrets,
invalid limits, and task mappings to missing profiles before network access.
Redirects are disabled so authorization cannot move to another host.

Configuration is resolved once per operation. Retries reuse the same profile,
secret, model, limits, and pricing snapshot. Environment changes require an
application restart or redeploy.

## Gemini Adapter

The real adapter uses the documented Gemini REST `generateContent` operation.
It translates provider-neutral instructions and ordered messages into Gemini
system instructions and contents without merging user and assistant roles.
For one image, it sends validated bytes as inline data with the detected MIME
type. It never logs or persists base64 content.

For structured requests, the adapter requests native JSON/schema output using
the API fields verified against current official Gemini documentation. The
application still parses JSON and validates it with the original Zod schema.
There is no free-text fallback and no LLM repair attempt.

The adapter maps provider request IDs, model identity, finish reasons,
refusals, token usage, `Retry-After`, HTTP failures, and malformed responses to
provider-neutral outcomes. It does not own retries. It uses a caller-supplied
attempt signal and disables redirects.

## Input And Asset Validation

Messages must be non-empty after trimming, maintain their original order, and
fit configured character/context limits. The service rejects excess input
rather than silently truncating it. Instructions remain distinct from user
messages. Every operation owns fresh arrays and state so histories cannot leak
between users.

The product image flow uses an internal `assetId`, not a browser URL. A new
`ai_assets` table records:

- Asset ID and owner user ID.
- Private R2 object key.
- Detected MIME type.
- Byte size, width, and height.
- Validation status and timestamps.

An authenticated upload path detects image content rather than trusting the
multipart MIME header, decodes dimensions, accepts JPEG/PNG/WebP only, enforces
the configured maximum of one image and at most 10 MB or a lower provider
limit, writes to a private R2 object, and persists metadata. Invalid uploads
are not registered as usable assets.

`AssetResolver` queries by both asset ID and authenticated user ID, reads only
the stored R2 object key, verifies actual content and dimensions again, and
returns bytes to the adapter. It never fetches caller-provided URLs or file
paths. Existing public/durable URLs used by the video flow are not accepted by
the new service.

## Structured Output Rules

The schema is constructed by trusted backend code and includes a stable name
and version for tracing. A structured request requires a profile with native
structured-output support. The service rejects:

- Empty provider content.
- Invalid JSON.
- JSON that does not match the runtime schema.
- Refusal or safety-blocked responses.
- Truncated/max-token responses.
- A successful HTTP response with an unsupported finish reason.

These conditions produce `AI_INVALID_OUTPUT` or `AI_REFUSED` as appropriate.
The service never uses `eval`, does not execute output, does not fill missing
fields with defaults, and does not ask the model to repair invalid output.

## Errors

`AIError` contains:

- `code`.
- `safeMessage`.
- `requestId`.
- `retryable`.
- Optional provider HTTP status and provider request ID.
- Internal sanitized diagnostic metadata unavailable to browser responses.

Supported codes are:

- `AI_CONFIG_ERROR`.
- `AI_CAPABILITY_UNSUPPORTED`.
- `AI_AUTH_ERROR`.
- `AI_RATE_LIMITED`.
- `AI_TIMEOUT`.
- `AI_UNAVAILABLE`.
- `AI_INPUT_INVALID`.
- `AI_INVALID_OUTPUT`.
- `AI_REFUSED`.
- `AI_CANCELLED`.

Routes map these errors to stable user-safe response codes and messages. Raw
provider/Supabase/R2 errors, stack traces, response bodies, and secrets never
leave the server.

## Timeout, Retry, Cancellation, And Concurrency

Defaults are configurable per profile/task:

- 30-second timeout per attempt.
- 65-second total deadline including backoff.
- Two total attempts.

Only explicit rate limits and known transient service responses are retryable.
Backoff honors a bounded `Retry-After` value or uses exponential delay with
jitter while sufficient deadline remains. Authentication, invalid input,
unsupported capability, refusal, truncation, invalid output, cancellation,
and ambiguous network/timeout failures are not retried.

An attempt timeout or connection loss after dispatch is considered ambiguous:
the provider may have processed and billed it. Its attempt record marks usage
and billing as unknown. The service does not claim at-most-once billing.

The external abort signal is combined with per-attempt and total-deadline
signals. Cancellation stops the active fetch where supported and prevents
future attempts. It cannot guarantee that already accepted provider work is
not billed.

The service factory owns one process-local semaphore with a configured maximum
number of concurrent operations. Waiting callers remain subject to their total
deadline and abort signal. This is defensive local control, not a distributed
global quota.

## Usage And Cost Persistence

Usage is independent of customer credits and video-generation state. Two
append-oriented tables are introduced.

`ai_service_operations` stores:

- Request ID, task, prompt version, and optional schema name/version.
- User ID and optional project ID as trace metadata without a foreign key to
  the removable video tables.
- Profile, provider label, model, timestamps, final status/error code,
  attempt count, total latency, aggregate token usage, estimated cost, cost
  currency/version/source, and whether cost is complete.

`ai_service_attempts` stores:

- Attempt ID, request ID, attempt number, profile/provider/model snapshot.
- Started/completed timestamps, latency, status/error code.
- Provider status/request ID.
- Normalized token usage and estimated cost.
- Whether dispatch outcome, usage, or billing is unknown.

The database stores no prompts, message bodies, responses, schemas, raw
provider payloads, image bytes, signed URLs, R2 credentials, or API keys. RLS
is enabled and direct `anon`/`authenticated` access is denied; service-role
repositories perform writes. Indexes support lookup by request, task, user,
status, and timestamp.

Operation usage aggregates all attempts. If any required usage dimension or
attempt cost is unknown, total cost is marked incomplete. Estimated cost is
`null` when no applicable versioned rate exists; unknown values are never
recorded as zero. The initial pricing mapper supports only documented input
and output token rates configured for the active model. Unsupported cached,
reasoning, image, or other billing dimensions make the estimate incomplete.

Usage persistence is best-effort only where recording an error itself fails:
the original AI outcome is preserved, and a sanitized server diagnostic is
emitted. Operation-start persistence must succeed before a paid network call,
ensuring each attempted request has a durable parent record.

## Caller Migration

The authenticated analyze route retains its business prompt and response
shape but changes from multipart image bytes passed directly to Gemini to an
internal asset workflow:

1. Authenticated upload creates an `ai_assets` record and returns its ID.
2. Analyze receives the owned asset ID.
3. It calls `generateStructured` with task `product_analysis`, prompt version,
   and `productSchema`.
4. `AIService` resolves and validates the asset before invoking Gemini.

The storyboard route keeps its product/storyboard business logic and response
shape but calls `generateStructured` with task `planner`, a prompt version, and
the existing storyboard schema. It does not import a provider adapter.

These are compatibility migrations, not implementations of the future
interviewer/planner product flow. No generic unauthenticated generation route
is introduced.

## Configuration Check And Smoke Tests

An internal CLI script exposes:

- `checkConfig`: parse all profiles/tasks, ensure adapter registration,
  validate trusted URLs, secret references, active credentials, capabilities,
  limits, and pricing consistency without performing network calls.
- `smoke:text`: explicit minimal text request.
- `smoke:structured`: explicit simple schema request.
- `smoke:vision`: explicit request requiring an existing owned test asset ID
  and user ID.

Smoke commands are never run on startup, deployment health checks, refresh, or
the regular test suite. They clearly warn that they may consume tokens. A
missing credential causes a configuration failure before networking; no fake
adapter silently replaces production behavior.

The app receives a `.env.example` containing variable names and non-secret
example values only. It documents how changing base URL, credential reference, model, and
capabilities switches a compatible profile without caller changes. It also
states that a new API format requires a registered adapter.

## Test Strategy

All behavior changes follow red-green-refactor TDD. Before editing tests, the
implementation will consult the TDD skill's `writing-good-tests.md` rules.

Unit and fixture coverage includes:

- Request validation, message ordering, and immutable request state.
- Missing/invalid profile, task, adapter, URL, key, model, limits, and pricing.
- Vision and structured capability rejection before adapter invocation.
- Asset ownership, missing assets, actual MIME, size, dimensions, and object
  integrity.
- Gemini translation for instructions, ordered roles, inline image, output
  schema, limits, redirect policy, and response normalization.
- Two local HTTP fixture endpoints with different profile/model/key values to
  prove profile routing and credential isolation.
- Text success and runtime-validated structured success.
- Empty, malformed, schema-invalid, refused, and truncated output.
- Authentication, rate limit, transient service, non-retryable failures,
  bounded `Retry-After`, jitter, deadline exhaustion, ambiguous timeout, and
  cancellation.
- Attempt and operation usage records, null token fields, aggregate costs,
  incomplete costs, and recorder failures.
- Concurrency-limit acquisition, cancellation while waiting, and release after
  success/failure.
- Supabase row mappings and route-level compatibility for analyze/storyboard.
- `checkConfig` proving no HTTP request is made.

Tests use fake domain adapters for deterministic orchestration failures and
real local HTTP fixture servers for adapter/profile behavior. They do not use
live Supabase or paid provider calls. Live smoke results are reported
separately and are never represented as fixture-test success.

## Verification

Before completion:

1. Run each focused Vitest test during its red and green phases.
2. Run the complete `apps/app` Vitest suite.
3. Run app lint and TypeScript/build validation using existing pnpm scripts.
4. Run `checkConfig` with non-secret fixture configuration and confirm it makes
   no network call.
5. Run `graphify update .` after source changes.
6. Run live smoke commands only with explicit user authorization and valid
   credentials/test asset; otherwise report them as not run.

The final report distinguishes code availability, fixture test results,
configuration-check results, and live integration results.

## Removal Independence

The following constraints make later video-flow deletion safe:

- New domain and application contracts do not import from existing
  storyboard/video-specific modules except caller-owned schemas at route
  boundaries.
- New database tables have no foreign keys, enums, functions, or triggers that
  depend on `ai_projects`, `ai_scenes`, `ai_generations`, credit tables, Atlas,
  or worker state.
- `context.projectId` is nullable trace text/UUID metadata only.
- Provider profiles and usage records model text/vision service operations,
  not video generation jobs.
- R2 product asset access uses the new asset registry, not video output URLs.
- Existing Atlas/image/video code is not required by the new service factory.

Deleting the unfinished video flow later may remove its callers and tables,
but must leave `domain/ai-service`, `application/ai-service`,
`infrastructure/ai-service`, `ai_assets`, `ai_service_operations`, and
`ai_service_attempts` intact.

## Risks And Mitigations

- Gemini schema support can differ by model. Profiles explicitly declare
  capabilities, configuration documentation names only verified models, and
  fixture tests validate translation without claiming live model support.
- Process-local concurrency is not global across instances. It is sufficient
  for this scope; distributed rate limiting can be added separately.
- Usage persistence adds a failure mode before paid calls. Failing closed at
  operation start preserves auditability and prevents untracked spend.
- Re-validating image bytes costs I/O. It prevents stale or tampered metadata
  from reaching the provider and is limited to one image of at most 10 MB.
- Migrating analyze from direct multipart input changes its request contract.
  The frontend caller must upload/register the asset first; route tests and
  integration documentation cover this intentional change.

## Acceptance

The feature is accepted when deterministic tests prove the requirement's
success and failure scenarios, both existing Gemini callers use `AIService`,
configuration can switch compatible endpoints/models without caller edits,
the service and its tables have no dependency on the old video flow, and the
final report accurately states whether live text, vision, and structured smoke
tests were run.
