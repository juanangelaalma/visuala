# AI Service - Flow Diagram

## Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API Routes (app/api/ai/)                     │
│  POST /analyze    POST /assets    POST /projects/storyboard         │
└────────┬──────────────┬──────────────────┬──────────────────────────┘
         │              │                  │
         ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Infrastructure Factory                            │
│              createAIService() + registerAsset()                    │
│  Wires: Supabase, R2, Adapter, UsageRecorder, ConcurrencyLimiter   │
└────────┬──────────────┬──────────────────┬──────────────────────────┘
         │              │                  │
         ▼              ▼                  ▼
┌────────────────┐ ┌──────────────┐ ┌─────────────────────────────────┐
│ DefaultAI      │ │ registerAsset│ │ resolveAIConfig / checkAIConfig  │
│ Service        │ │ (use case)   │ │ (config resolution)             │
│ (orchestrator) │ └──────────────┘ └─────────────────────────────────┘
└────────┬───────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Domain Contracts                               │
│  AIService, ProviderAdapter, AssetResolver, UsageRecorder           │
│  AIError, AIErrorCode, AIAsset, ResolvedAIConfig                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Request Flow: `generateStructured()` (e.g. analyze, storyboard)

```
Client POST /api/ai/analyze
│
├─1. authenticated() ─── verify user session
│
├─2. createAIService({ schemas: { "product@1": productSchema } })
│    └── buildAIService() wires all dependencies
│
├─3. service.generateStructured(request)
│    │
│    ├─3a. Check abortSignal
│    │
│    ├─3b. resolveConfig(task)
│    │     └── Reads AI_PROFILES_JSON / AI_TASKS_JSON from env
│    │         Maps task → profile → { provider, modelId, baseUrl, apiKey, limits }
│    │
│    ├─3c. usageRecorder.startOperation()
│    │     └── INSERT into ai_service_operations (status: "started")
│    │
│    ├─3d. validateStructuredRequest()
│    │     └── Check capabilities, char limits, output token limits, image count
│    │
│    ├─3e. resolveAsset() [if message has assetId]
│    │     └── Fetch from ai_assets table → read bytes from R2
│    │         → re-validate dimensions, SHA256, provider limits
│    │
│    ├─3f. acquirePermit() ─── ConcurrencyLimiter (async semaphore)
│    │     └── Waits in FIFO queue if at capacity
│    │         Respects totalDeadlineMs + abortSignal
│    │
│    ├─3g. runAttempts() ─── retry loop
│    │     │
│    │     │  ┌─── For attemptNumber = 1..maxAttempts ───┐
│    │     │  │                                           │
│    │     │  │  usageRecorder.startAttempt()              │
│    │     │  │  └── INSERT into ai_service_attempts       │
│    │     │  │                                           │
│    │     │  │  invoke(providerRequest, adapter)          │
│    │     │  │  └── GoogleGenerateContentAdapter          │
│    │     │  │      .generateStructured()                │
│    │     │  │      ├── Build Gemini generateContent      │
│    │     │  │      │   request body                      │
│    │     │  │      ├── POST to Google API                │
│    │     │  │      ├── Parse response, normalize         │
│    │     │  │      │   finishReason                      │
│    │     │  │      └── Return { json, usage, model,     │
│    │     │  │           finishReason }                   │
│    │     │  │                                           │
│    │     │  │  validate(output)                          │
│    │     │  │  ├── requireSuccessfulOutput()             │
│    │     │  │  │   (finishReason == "stop"?)             │
│    │     │  │  └── parseStructuredOutput()               │
│    │     │  │      (Zod schema.parse on JSON)            │
│    │     │  │                                           │
│    │     │  │  ON SUCCESS:                               │
│    │     │  │  └── finalizeAttempt() + return            │
│    │     │  │                                           │
│    │     │  │  ON FAILURE:                               │
│    │     │  │  ├── normalizeError()                      │
│    │     │  │  ├── finalizeAttempt(errorCode)            │
│    │     │  │  ├── canRetry?                             │
│    │     │  │  │   (only RATE_LIMITED/UNAVAILABLE        │
│    │     │  │  │    + retryable + rejected)              │
│    │     │  │  └── sleep(retryDelay) with backoff        │
│    │     │  │      (retryAfterMs or 2^n * random)       │
│    │     │  │                                           │
│    │     │  └─────────────────────────────────────────────┘
│    │     │
│    │     └── Return { output, value, attempts, attemptCount }
│    │
│    ├─3h. aggregateOperationUsage() ─── sum tokens + cost
│    │
│    ├─3i. finalizeOperationSafely()
│    │     └── UPDATE ai_service_operations (status: "succeeded")
│    │
│    └─3j. Return StructuredResult<T> { requestId, data, usage, cost }
│
└─4. Response.json({ product: result.data })
```

## Asset Upload Flow: `POST /api/ai/assets`

```
Client POST /api/ai/assets (multipart form, field: "image")
│
├─1. authenticated()
│
├─2. Extract single File from FormData
│
├─3. registerAsset(input, deps)
│    │
│    ├─3a. parseImage(bytes)
│    │     └── Read magic bytes (PNG/JPEG/WebP header)
│    │         Extract width, height, mimeType
│    │         Validate structural completeness
│    │         Enforce MAX_ASSET_BYTES (10 MB)
│    │
│    ├─3b. Generate SHA256 hash of bytes
│    │
│    ├─3c. Generate objectKey: "ai/{userId}/assets/{uuid}.{ext}"
│    │
│    ├─3d. objectStore.put(objectKey, bytes, mimeType)
│    │     └── R2ObjectStore → S3 PutObject to Cloudflare R2
│    │
│    ├─3e. repository.create(asset)
│    │     └── SupabaseAssetRepository → INSERT into ai_assets
│    │         (id, user_id, object_key, mime_type, byte_size,
│    │          sha256, width, height, validated: true)
│    │
│    └─3f. On DB failure → objectStore.delete(objectKey) rollback
│
└─4. Response.json({ asset: { id, mimeType, byteSize, width, height } })
```

## Error Handling Flow

```
Any error during execution
│
├── AIError (domain error)
│   └── AI_ERROR_RESPONSES maps to HTTP status + safe message
│       ├── AI_CONFIG_ERROR     → 503 "not configured"
│       ├── AI_AUTH_ERROR       → 503 "unavailable"
│       ├── AI_RATE_LIMITED     → 429 "busy, try again"
│       ├── AI_TIMEOUT          → 504 "timed out"
│       ├── AI_UNAVAILABLE      → 503 "unavailable"
│       ├── AI_INPUT_INVALID    → 400 "invalid input"
│       ├── AI_INVALID_OUTPUT   → 502 "invalid response"
│       ├── AI_REFUSED          → 422 "could not complete"
│       ├── AI_CANCELLED        → 499 "cancelled"
│       └── AI_CAPABILITY_UNSUPPORTED → 422 "not supported"
│
├── ApiError (HTTP-layer error, kept as-is)
│
├── ZodError (validation) → 400 first issue message
│
├── INSUFFICIENT_CREDITS → 402
│
└── Unknown Error → 500 "The request could not be completed"
    (provider details NEVER exposed to client)
```

## Configuration Resolution

```
Environment Variables
│
├── AI_PROFILES_JSON ─── array of connection profiles
│   └── { id, provider, baseUrl?, apiKeyEnv, modelIdEnv,
│         apiFormat, capabilities, limits, pricing }
│
├── AI_TASKS_JSON ─── task → profile mapping
│   └── { task: "product_analysis" | "planner" | ...,
│         profileId: "gemini-default" }
│
├── AI_MAX_CONCURRENCY ─── process-wide cap
│
└── Per-profile env vars (e.g. GEMINI_API_KEY, GEMINI_MODEL_ID)

resolveAIConfig(task)
│
├── Find task config → get profileId
├── Find profile by profileId
├── Read apiKey + modelId from env vars
├── Validate baseUrl (HTTPS, no credentials, no loopback)
├── Merge capabilities + limits
└── Return frozen ResolvedAIConfig
```

## Dependency Graph (Clean Architecture)

```
                    ┌──────────────┐
                    │  API Routes  │
                    └──────┬───────┘
                           │ uses
                           ▼
┌──────────────────────────────────────────────────┐
│              infrastructure/ai-service            │
│  ┌────────────────────┐  ┌─────────────────────┐ │
│  │ createAIService()  │  │ GoogleGenerate      │ │
│  │ (factory)          │  │ ContentAdapter      │ │
│  └────────┬───────────┘  └─────────────────────┘ │
│           │               ┌─────────────────────┐ │
│           │               │ R2ObjectStore       │ │
│           │               ├─────────────────────┤ │
│           │               │ SupabaseAsset       │ │
│           │               │ Repository          │ │
│           │               ├─────────────────────┤ │
│           │               │ SupabaseUsage       │ │
│           │               │ Recorder            │ │
│           │               └─────────────────────┘ │
└───────────┼──────────────────────────────────────┘
            │ creates
            ▼
┌──────────────────────────────────────────────────┐
│              application/ai-service               │
│  ┌─────────────────┐  ┌────────────────────────┐ │
│  │ DefaultAIService│  │ resolveConfig          │ │
│  │ (orchestrator)  │  │ validateRequest        │ │
│  ├─────────────────┤  │ calculateCost          │ │
│  │ registerAsset   │  │ ConcurrencyLimiter     │ │
│  │ resolveAsset    │  │ imageParser            │ │
│  └─────────────────┘  └────────────────────────┘ │
└───────────┼──────────────────────────────────────┘
            │ depends on
            ▼
┌──────────────────────────────────────────────────┐
│              domain/ai-service                    │
│  contracts.ts  types.ts  errors.ts  config.ts     │
│  assets.ts     usage.ts                           │
│  (interfaces, types, domain errors only)          │
└──────────────────────────────────────────────────┘
```

## Key Changes from Old System

| Aspect | Before (old) | After (new) |
|--------|-------------|-------------|
| Provider | `GoogleGeminiTextProvider` hardcoded | `ProviderAdapter` interface + `GoogleGenerateContentAdapter` |
| Text generation | Direct `fetch()` to Gemini API in route | `DefaultAIService.generateStructured()` orchestrator |
| Error handling | `throw new Error("Gemini failed")` | `AIError` with 10 typed codes, safe messages, no provider leak |
| Asset upload | Direct R2 upload in route handler | `registerAsset` use case with validation, rollback |
| Asset reference | Base64 inline images | `assetId` reference, DB-tracked `ai_assets` table |
| Usage tracking | None | `ai_service_operations` + `ai_service_attempts` tables |
| Retry | Single manual retry in provider | Configurable retry loop with exponential backoff |
| Concurrency | Unlimited | Process-global `ConcurrencyLimiter` (async semaphore) |
| Cost tracking | None | Per-attempt cost calculation, aggregated per operation |
| Configuration | Hardcoded model + API key env | `AI_PROFILES_JSON` + `AI_TASKS_JSON` multi-profile system |
| Validation | Inline checks in route | `validateRequest` with capability + limit checks |
| Schema | Passed as Zod type | Named + versioned schemas (`name@version`) |
