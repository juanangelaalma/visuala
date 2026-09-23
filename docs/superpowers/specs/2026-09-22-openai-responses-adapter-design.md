# OpenAI-Compatible Responses Adapter Design

Date: 2026-09-22

## Purpose

Replace the backend AI service's Google Gemini `generateContent` transport with
a non-streaming OpenAI-compatible Responses API transport. The first target is
a local 9Router gateway whose OpenAI base URL is
`http://localhost:20128/v1`, making the operation URL
`http://localhost:20128/v1/responses`.

The migration must preserve the provider-neutral `AIService` contract and its
existing orchestration, persistence, asset ownership, retry, cancellation, and
concurrency behavior. Google support is removed rather than retained as a
fallback.

## Scope

The implementation includes:

- One REST adapter for the strict OpenAI Responses API contract.
- Bearer-token authentication against a profile-controlled base URL.
- Non-streaming text, ordered conversation, single-image, and native structured
  output requests.
- Responses API output, refusal, incomplete response, usage, and error
  normalization into the existing provider-neutral domain types.
- Replacement of the registered API-format ID, service-factory wiring,
  configuration examples, tests, and operational documentation.
- Removal of the Google `generateContent` adapter and its tests.

The implementation excludes:

- Streaming and SSE routes.
- Chat Completions support.
- Supporting Google and OpenAI formats concurrently.
- Tool calling, hosted tools, background responses, conversations, and response
  retrieval.
- Custom authentication headers or arbitrary caller-provided headers.
- Changes to the public `AIService` methods or result types.
- Historical usage-record migration.

## Existing Context

The backend already separates provider-neutral domain and application logic
from provider-specific infrastructure. `DefaultAIService` owns validation,
profile resolution, retries, timeout, cancellation, structured-response Zod
validation, usage recording, and concurrency. The current provider-specific
surface is concentrated in:

- `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.ts`
- `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.test.ts`
- The API-format constant and registry in
  `apps/backend/src/infrastructure/ai-service/config.ts`.
- Adapter selection in
  `apps/backend/src/application/ai-service/services.ts`.
- Provider-specific examples and fixture values in backend tests and docs.

The package uses native `fetch`, Zod 4, and Vitest. It does not currently depend
on the OpenAI JavaScript SDK.

## Architecture

### Preserved Boundaries

The following interfaces and responsibilities remain unchanged:

- `AIService.generateText` and `AIService.generateStructured`.
- Provider-neutral request, result, usage, finish-reason, and error types.
- Profile and task selection.
- Asset ownership and byte validation.
- Retry, timeout, total deadline, cancellation, and process concurrency.
- Operation and attempt usage persistence.
- Route and CLI contracts.

Application code continues to depend on `ProviderAdapter`, not the concrete
Responses implementation.

### New Infrastructure Adapter

`OpenAIResponsesAdapter` implements `ProviderAdapter` with native `fetch`. Its
options are:

```ts
export type OpenAIResponsesAdapterOptions = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  schemas?: Readonly<Record<string, ZodType>>;
};
```

The adapter uses the API-format ID `openai-responses`. It is the only registered
format after this migration. Profiles that still declare
`google-generate-content` fail configuration validation before any provider
request.

No OpenAI SDK is added. The direct REST implementation keeps the transport
small, permits a configurable 9Router host, and avoids SDK assumptions beyond
the explicitly tested wire contract.

## Endpoint And Authentication

The profile's `baseUrl` is an OpenAI API root, not the full operation URL. The
adapter removes trailing slashes and appends `/responses` exactly once.

Examples:

```text
http://localhost:20128/v1     -> http://localhost:20128/v1/responses
https://gateway.example/v1/   -> https://gateway.example/v1/responses
```

The request uses:

```http
Authorization: Bearer <profile API key>
Content-Type: application/json
```

The existing configuration resolver continues to reject credentials embedded
in URLs, query strings, fragments, and untrusted insecure URLs. Local 9Router
HTTP is permitted only when `AI_ALLOW_INSECURE_LOOPBACK=true`. Fetch uses
`redirect: "manual"` so credentials cannot follow a redirect to another host.

## Request Mapping

Every request sends:

```json
{
  "model": "<configured model>",
  "instructions": "<server-authored instructions>",
  "input": [],
  "max_output_tokens": 321,
  "store": false
}
```

`stream` is not enabled. The service waits for one complete JSON response.

### Messages

Provider-neutral messages retain their order and role. Each message is mapped
to an input message with `role` set to `user` or `assistant` and a content
array. Text becomes:

```json
{ "type": "input_text", "text": "message text" }
```

The adapter does not merge messages, flatten history, or convert assistant
messages into user content.

### Image Input

When the application resolves the single allowed owned image, the adapter adds
this item to the content array of the message whose `assetId` matches:

```json
{
  "type": "input_image",
  "detail": "auto",
  "image_url": "data:image/png;base64,<encoded bytes>"
}
```

Only the already validated JPEG, PNG, and WebP MIME types can reach the
adapter. Base64 content is never logged or persisted.

### Structured Output

For `generateStructured`, the adapter looks up the trusted Zod schema by the
existing `name@version` key and converts it with `z.toJSONSchema` using draft-7
and `unrepresentable: "throw"`. It adds:

```json
{
  "text": {
    "format": {
      "type": "json_schema",
      "name": "<schema name>",
      "schema": {},
      "strict": true
    }
  }
}
```

Schema version remains internal trace metadata and part of the registry key;
the format `name` uses the schema name expected by the Responses API. Missing
or unrepresentable schemas fail with `AI_CONFIG_ERROR` before fetch.

The adapter returns the output text as `json`. `DefaultAIService` continues to
parse it and validate it with the caller-owned Zod schema. Provider-side strict
output therefore does not replace local runtime validation.

## Response Mapping

The adapter accepts a JSON object shaped as a Responses API response. A normal
success has:

- A string `id` used as `providerRequestId`.
- `status: "completed"`.
- An `output` array containing one or more message items.
- Message `content` arrays containing `output_text` items.
- Optional `model` and `usage` fields.

The adapter selects completed assistant message output and concatenates
`output_text.text` values in output order. A response with no non-empty output
text is invalid. Tool-only output is unsupported and therefore invalid.

The returned model uses the response's non-empty `model` when present and the
configured model otherwise. Usage maps as follows:

```text
usage.input_tokens  -> inputTokens
usage.output_tokens -> outputTokens
usage.total_tokens  -> totalTokens
```

Missing or non-integer usage values become `null`, never zero.

### Refusals

Any output message content item with `type: "refusal"` produces
`AI_REFUSED`. The refusal text is not exposed in the safe error message or
persisted.

### Incomplete Responses

`status: "incomplete"` with `incomplete_details.reason` equal to
`max_output_tokens` returns the available output text with finish reason
`length`. Existing application behavior may accept partial plain text but
rejects truncated structured output.

Other incomplete reasons are normalized to `AI_UNAVAILABLE` without retry,
unless an official Responses API reason is explicitly added to the tested
mapping later.

`failed`, `cancelled`, `queued`, and `in_progress` are not successful
synchronous results. Failed synchronous responses map to `AI_UNAVAILABLE`;
cancelled responses map to `AI_CANCELLED`; non-terminal statuses map to
`AI_UNAVAILABLE`. Unknown or malformed status values produce
`AI_INVALID_OUTPUT`.

### Invalid Success Payloads

The following produce `AI_INVALID_OUTPUT`:

- A non-object or malformed JSON body.
- Missing or invalid response status.
- A completed response without non-empty output text.
- Malformed output or content arrays.
- Tool-only output.
- Invalid usage types do not fail the response; those individual values become
  `null`.

Raw payloads and provider messages are not included in errors.

## HTTP And Network Errors

The existing normalized error model remains in use:

| Condition | Error | Retryable |
| --- | --- | --- |
| HTTP 400 or 422 | `AI_INPUT_INVALID` | no |
| HTTP 401 or 403 | `AI_AUTH_ERROR` | no |
| HTTP 429 | `AI_RATE_LIMITED` | yes |
| HTTP 500-599 | `AI_UNAVAILABLE` | yes |
| Redirect or other HTTP status | `AI_UNAVAILABLE` | no |
| Attempt signal aborted | `AI_CANCELLED` | no |
| Generic fetch failure after dispatch | `AI_UNAVAILABLE` with ambiguous dispatch | no |

Provider request IDs are read from the JSON response `id` on success and from
`x-request-id` or the error JSON `request_id`/`id` on HTTP failure. The adapter
continues to parse integer or HTTP-date `Retry-After` values. Error response
bodies are parsed only for safe metadata and are never surfaced to callers.

## Configuration Migration

The registered format constant becomes:

```ts
export const OPENAI_RESPONSES_FORMAT = "openai-responses";
```

The service factory instantiates only `OpenAIResponsesAdapter`. Example
profiles use gateway-neutral environment names:

```text
AI_OPENAI_API_KEY
AI_OPENAI_MODEL
```

An example local 9Router profile uses:

```json
{
  "id": "primary",
  "apiFormat": "openai-responses",
  "baseUrl": "http://localhost:20128/v1",
  "apiKeyEnv": "AI_OPENAI_API_KEY",
  "modelIdEnv": "AI_OPENAI_MODEL",
  "provider": "9router"
}
```

Its model value may be a gateway route such as `cx/gpt-5.6-luna`. The adapter
treats model IDs as opaque non-empty strings in the JSON body; unlike the
Gemini adapter, it does not turn model IDs into URL path segments.

There is no compatibility alias for `google-generate-content` and no silent
conversion of existing profiles. Deployment configuration must be updated in
the same release. Historical operation and attempt rows retain their recorded
provider and model snapshots unchanged.

## Files And Responsibilities

### Created

- `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts`
  translates provider-neutral requests and normalizes Responses API results.
- `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.test.ts`
  verifies the exact wire contract and normalization against local HTTP
  fixtures.

### Deleted

- `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.ts`
- `apps/backend/src/infrastructure/ai-service/google-generate-content-adapter.test.ts`

### Modified

- `apps/backend/src/infrastructure/ai-service/config.ts` registers only
  `openai-responses`.
- `apps/backend/src/application/ai-service/services.ts` constructs the new
  adapter.
- `apps/backend/src/application/ai-service/services.test.ts` updates profile,
  environment, and fixture expectations.
- `apps/backend/src/scripts/ai-service.test.ts` updates provider/model fixture
  labels where they represent the active provider.
- `apps/backend/docs/ai-provider-service.md` documents Responses API and
  9Router configuration.
- `apps/backend/docs/chat-video-generator.md` removes stale statements that the
  backend only supports Google and documents the new environment names.
- `apps/backend/.env.example` lists the referenced non-secret environment
  variable names if the project's example convention includes indirect profile
  secrets and model values.

Tests whose Google/Gemini values are merely arbitrary provider-neutral domain
fixtures do not need mechanical renaming unless they describe the active
infrastructure format. This avoids unrelated churn.

## Test Strategy

Implementation follows red-green-refactor TDD.

### Adapter Request Fixtures

Tests verify:

- Exact `/responses` operation URL without duplicate slashes or API versions.
- Bearer authorization, JSON content type, manual redirects, and attempt signal.
- Configured model, instructions, `store: false`, output-token limit, and
  non-streaming request behavior.
- Ordered user and assistant messages.
- Image data URL with the validated MIME type and bytes.
- Strict `text.format` JSON schema generated from the registered Zod schema.
- Missing and unrepresentable schemas fail before network access.
- Two adapters keep URLs, credentials, models, and instructions isolated.
- Abort propagation.

### Adapter Response Fixtures

Tests verify:

- The completed 9Router-style response supplied during design discussion.
- Multiple output-text parts are concatenated in order.
- Response model override and configured-model fallback.
- Missing usage becomes null values.
- Refusal content maps to `AI_REFUSED`.
- Max-output incomplete responses map to finish reason `length`.
- Other incomplete, failed, cancelled, and non-terminal statuses map safely.
- Empty, malformed, and tool-only outputs are rejected.
- Secret provider body text never appears in errors.

### HTTP And Failure Fixtures

Tests verify:

- HTTP 400, 401, 403, 422, 429, and representative 5xx mappings.
- Redirects are not followed.
- `Retry-After` seconds and dates.
- Request ID extraction from supported headers and error metadata.
- Generic network failure remains an ambiguous dispatch.

### Factory And Configuration

Tests verify:

- `openai-responses` is the only registered format.
- `google-generate-content` is rejected.
- Factory wiring creates and invokes the Responses adapter.
- Offline config checking performs no HTTP request.
- Local HTTP remains guarded by `AI_ALLOW_INSECURE_LOOPBACK=true`.

No test uses a paid provider or live 9Router process.

## Verification

Before completion:

1. Run the focused Responses adapter test during red and green phases.
2. Run focused configuration, factory, and CLI tests.
3. Run the complete backend Vitest suite.
4. Run backend TypeScript build/lint through existing pnpm scripts.
5. Run `ai:check-config` with a non-secret fixture configuration and verify no
   HTTP request is made.
6. Run `graphify update .` after source changes.
7. Run a live text, structured, or vision smoke command against 9Router only
   with explicit authorization and active credentials. Otherwise report every
   live smoke test as `NOT RUN`.

## Acceptance Criteria

The migration is accepted when:

- No Google adapter or registered Google API format remains active.
- Existing `AIService` callers compile without contract changes.
- Deterministic fixtures prove text, ordered history, image input, strict
  structured output, usage, refusal, incomplete output, cancellation, and HTTP
  error behavior through `/responses`.
- A local 9Router profile can use `http://localhost:20128/v1` only under the
  explicit insecure-loopback flag.
- Configuration documentation contains the 9Router base URL, Bearer auth,
  `openai-responses` format, and non-streaming limitation.
- All backend tests and TypeScript validation pass.
- Live compatibility is not claimed unless the authorized smoke commands were
  actually run.

## Risks And Mitigations

- 9Router may implement only a subset of Responses API. The adapter targets the
  strict contract and fixture tests document every required field; optional
  live smoke tests determine deployment compatibility without weakening the
  parser speculatively.
- Structured-output or vision support may vary by routed model. Profiles keep
  explicit capability flags, and unsupported models must disable those
  capabilities rather than relying on fallback prompts.
- Replacing the only registered format is a deployment-breaking configuration
  change. Documentation and config checks make the required profile migration
  explicit; no unsafe silent alias is provided.
- Streaming could improve perceived latency but changes service, route,
  persistence, and cancellation contracts. It remains a separate feature.
- OpenAI may add output item types or statuses. Unknown values fail safely and
  can be added later with focused fixtures.
