# Chat video generator — backend foundation

This is the operator and API reference for the chat-based AI video generator backend that lives in
`apps/backend`. It documents the surface that Tasks 5–13 of the
`2026-09-21-chat-video-generator-backend-foundation` plan built (private Supabase Storage for project
assets, the `video_*` schema, the project state machine, and the authenticated HTTP API for
projects, assets, chat messages, brief/storyboard revisions, approval, render-job intake, and version
listing/download), plus what the `2026-09-22-hyperframes-render-pipeline` plan added on top: the
HyperFrames render engine, the deterministic composition writer, the separate render worker process,
MP4 upload, and the `video_versions` row that makes the player and the download real.

The PRD this implements is `docs/prd/chat-based-ai-video-generator-mvp.md`.

## Scope

This is the server-side data, API, and render layer. It persists and validates everything a render
needs, and a worker process now claims the durable job rows it writes and turns them into MP4s.

**What this backend does:**

- Stores project image assets in a private Supabase Storage bucket, behind the existing
  provider-neutral `AssetObjectStore` interface.
- Owns the complete `video_*` schema in Postgres, with row-level security, browser-role revocation,
  column-scoped grants, and `@visuala/db` row types.
- Models the video domain: output settings and validation, style presets, the render-compatibility
  allowlist, the project state machine, and the brief/storyboard schemas with completeness,
  provenance, and timing validation.
- Serves the PRD API surface over authenticated Elysia routes: projects, assets, messages,
  brief/storyboard revisions (internal use cases), approval, render-job intake/cancel/status, and
  version listing/download.
- Renders a queued job into a deterministic MP4 with HyperFrames, verifies the encoded file with
  FFprobe, uploads it, and records the `video_versions` row. The worker is a separate process, so a
  long render never holds a request open.

**What this backend explicitly does NOT do:**

1. **It never calls a model from the render path.** The render pipeline reads the approved brief and
   storyboard that the AI orchestration layer already persisted; it makes no provider request of any
   kind.
2. **It produces silent video.** No TTS, music, or audio provider is wired, so every rendered MP4
   has no audio stream. `voiceOverEnabled` still has an effect: it is what makes the storyboard carry
   `caption` text, and those captions are burned into the frame as on-screen text.
3. **It has no frontend of its own.** Every route is server-to-server or client-to-API.

**The plans that complete the product:**

- **AI orchestration plan**: the `interviewer`, `planner`, `revision_planner`, and `moderation` task
  callers, multi-image analysis, prompt construction, the assistant reply inside
  `POST /video-projects/:projectId/messages`, and the write path that produces brief/storyboard
  revisions via `saveBriefRevision` / `saveStoryboardRevision`. Still open.
- **Render plan**: shipped by `2026-09-22-hyperframes-render-pipeline`: the HyperFrames
  `RenderEngine`, the template registry and style packs, `RenderManifest` construction, the worker
  process that consumes `video_render_jobs`, MP4 upload, and the `video_versions` row that follows
  it. See "Render pipeline" below.
- **Frontend plan**: every `apps/app` task. Still open.

### Two disclosures that must not be lost

**1. The HyperFrames spike ran; the 9Router and media-provider spikes did not.**
The render plan's Task 1 ran the HyperFrames render-engine spike on 2026-09-22 and wrote
`docs/decisions/2026-09-21-hyperframes-render-engine.md`, which records the pinned versions
(`@hyperframes/producer` 0.8.59, Apache-2.0), the resolved Chrome and FFmpeg paths, the per
combination render times for all eighteen combinations, and the determinism measurements. The other
two spikes did not run, so the following is still true:

- The AI service registers the `openai-responses` adapter at
  `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts`.
- The registered API format is `openai-responses`
  (`apps/backend/src/infrastructure/ai-service/config.ts`, `registeredApiFormats`). Profiles using
  another `apiFormat` fail configuration validation (`AI_CONFIG_ERROR`).
- **There are no `AI_9ROUTER_*` variables to set.** The 9Router profile references
  `AI_OPENAI_API_KEY` and `AI_OPENAI_MODEL` by name. The current adapter is non-streaming, and
  model-specific text, vision, and native structured-output support remains controlled by profile
  capability flags.
- `docs/decisions/2026-09-21-9router-api-format.md` and
  `docs/decisions/2026-09-21-media-providers.md` still do not exist. They are pending their spikes.

**2. `RENDER_SUPPORTED_COMBINATIONS` is now a verified result, not an assumption.**
`apps/backend/src/domain/video/render-compatibility.ts` lists all 18 combinations of
3 aspect ratios × 2 resolutions × 3 durations, and the HyperFrames spike rendered every one of them
with matching FFprobe dimensions and an exact duration. The source is
`docs/decisions/2026-09-21-hyperframes-render-engine.md`, and that file now exists. The list is
therefore what a renderer has been *proven* to produce on this host, and
`render-compatibility.test.ts` asserts it equals the full matrix exactly rather than merely
containing it. Adding or removing a row requires a new spike entry in that record. Note the record's
open question: determinism was proven on one host and one capture mode, so a deployment that renders
in Docker must keep rendering in Docker.

## Environment

`apps/backend/Makefile`'s `env:` target is the documented way to get a local `.env`. It is
idempotent: if `apps/backend/.env` already exists it prints
`.env already exists - leaving it untouched` and writes nothing. Otherwise it creates `.env` from
`apps/app/.env`, copying `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ASSET_BUCKET`, `ADMIN_EMAILS`, every
`AI_*`, `BILLING_*`, and `XENDIT_*` value, deriving `SUPABASE_ANON_KEY` from
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and prepending `PORT`, `APP_URL`, and `CORS_ORIGIN`. Run it from the
repository root:

```bash
make -C apps/backend env
```

**Known gap:** the target's grep looks for `SUPABASE_URL` in `apps/app/.env`, which holds only
`NEXT_PUBLIC_SUPABASE_URL`, so the generated file has no `SUPABASE_URL`. `src/env.ts` requires it, so
a fresh `make env` produces a backend that cannot boot until you add it yourself:

```bash
printf 'SUPABASE_URL=%s\n' "$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' apps/app/.env | cut -d= -f2-)" >> apps/backend/.env
```

The target also copies no `VIDEO_*`, `RENDER_*`, `HYPERFRAMES_*`, or `PRODUCER_*` value, because its
grep pattern does not match those prefixes. That is deliberate: their code defaults are what runs,
and each one is documented in the tables below.

`apps/backend/.env.example` documents non-secret backend configuration. `apps/backend/.env` is
gitignored (`apps/backend/.gitignore`). Never commit keys or production values.

### Variables this foundation reads

Defaults below are taken from the code, not invented. "No default" means the value is required and
its absence is a configuration error.

| Variable | Default | Meaning |
|---|---|---|
| `SUPABASE_URL` | no default | Supabase project URL. Used by the service-role and user clients. |
| `SUPABASE_SERVICE_ROLE_KEY` | no default | Service-role key. Used **only** inside `application/**/services.ts` factories and `infrastructure/**`. |
| `SUPABASE_ANON_KEY` | no default | Anon/publishable key for the public client used to resolve a bearer token into a session. The `env:` target derives it from `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `SUPABASE_ASSET_BUCKET` | `assets` | Name of the private Storage bucket that holds both the AI-service image assets and the project image assets and rendered versions. Read by `readAssetBucket` in `apps/backend/src/infrastructure/ai-service/supabase-asset-object-store.ts`. |
| `VIDEO_MAX_ASSETS_PER_PROJECT` | `8` | Maximum live image assets per project. Read by `readAssetLimits` in `apps/backend/src/domain/video/limits.ts`. |
| `VIDEO_MAX_PROJECT_ASSET_BYTES` | `41943040` (40 MiB) | Maximum total bytes across a project's live assets. |
| `VIDEO_MIN_IMAGE_DIMENSION` | `200` | Minimum width and height, in pixels, of an accepted image. |
| `VIDEO_MAX_IMAGE_DIMENSION` | `8000` | Maximum width and height, in pixels, of an accepted image. |
| `VIDEO_MAX_RENDER_OUTPUT_BYTES` | `524288000` (500 MB) | Ceiling for one rendered MP4. Read by the render worker config in `apps/backend/src/domain/video/render-config.ts`, and it must match the bucket's `file_size_limit`. An output over it fails the job with `render_output_too_large`. |
| `RENDER_FPS` | `30` | Frame rate frozen into every new job snapshot and used by the engine. The intake and the worker read the same value, so a change cannot make a queued job claim one rate and render another. |
| `RENDER_QUALITY` | `standard` | One of `draft`, `standard`, `high`; passed straight to the producer. |
| `RENDER_WORKER_POLL_MS` | `2000` | How long the worker sleeps when the queue is empty. |
| `RENDER_WORKER_CONCURRENCY` | `1` | Documented worker concurrency. The claim loop currently renders one job at a time; a second worker *process* is safe, which is what the conditional claim guarantees. |
| `RENDER_JOB_TIMEOUT_MS` | `600000` (10 min) | The PRD's processing budget. The render is aborted, not killed, so HyperFrames unwinds through its own cancellation path and leaves no Chrome or FFmpeg behind. Exceeding it fails the job with `render_timeout`. |
| `RENDER_STALE_JOB_MS` | `900000` (15 min) | The staleness window. **Must be greater than `RENDER_JOB_TIMEOUT_MS`**, or the reclaimer would fail jobs that are still rendering; the config reader refuses a value that is not. |
| `RENDER_WORK_DIR` | none (system temp) | Root for each attempt's work directory. Every attempt gets a fresh `mkdtemp` under it and the directory is removed in a `finally`. |
| `HYPERFRAMES_BROWSER_PATH` | none (producer's managed `chrome-headless-shell`) | Path to the Chrome binary. **Set it explicitly in deployment** to pin the browser, per the decision record's determinism risk. |
| `HYPERFRAMES_FFMPEG_PATH` | none (`ffprobe` / `ffmpeg` from `PATH`) | Path to the FFmpeg binary. The sibling `ffprobe` is derived from it, so one path covers both. |
| `HYPERFRAMES_EXTRACT_CACHE_DIR` | none (system temp) | Where HyperFrames extracts its browser and encoder. Leave the default on a host with a real `/tmp`: a cold cache made the spike's first render 76 s against 6–11 s warm. |
| `PRODUCER_LOW_MEMORY_MODE` | `false` | Passed to the producer. The spike measured a peak near 870 MiB for a 1080p high-quality render. |
| `PRODUCER_MAX_WORKERS` | `1` | Capture workers per render. |
| `PRODUCER_DISABLE_GPU` | `true` | Removes the GPU as a variable. The spike's host reported `hardware gpu` natively and `software gpu` inside Docker, and the two capture modes produced different bytes. |
| `AI_PROFILES_JSON` | no default | JSON array of connection profiles (text, vision, structured output, limits, optional pricing). Read by `readAIServiceConfiguration`. |
| `AI_TASKS_JSON` | no default | JSON array mapping each of `connection_test`, `interviewer`, `planner`, and `product_analysis` to a profile ID. |
| `AI_MAX_CONCURRENCY` | no default | Positive integer: the initial process-wide AI request cap. A lower task/profile cap tightens the shared limiter and it never loosens until restart. |
| `AI_OPENAI_API_KEY` | no default | Read indirectly: a profile's `apiKeyEnv` typically names it. The 9Router profile's credential variable. |
| `AI_OPENAI_MODEL` | no default | Read indirectly via a profile's `modelIdEnv`. The 9Router profile's model variable. |
| `AI_ALLOW_INSECURE_LOOPBACK` | unset (`false`) | Set to `true` to let the AI service call a plain-HTTP loopback endpoint, including `http://127.0.0.1:20128/v1` for 9Router. |

Notes:

- `VIDEO_MAX_ASSETS_PER_PROJECT`, `VIDEO_MAX_PROJECT_ASSET_BYTES`, `VIDEO_MIN_IMAGE_DIMENSION`, and
  `VIDEO_MAX_IMAGE_DIMENSION` are the PRD's **proposed MVP defaults**; the PRD leaves the asset
  count, project byte ceiling, and dimension bounds **TBD** pending storage and vision benchmarks.
  A non-numeric value is rejected with `video_input_invalid`.
- The `AI_*` and `SUPABASE_ASSET_BUCKET` variables are all copied through by the `env:`
  target's grep pattern. If you add a new variable in one of those families, the pattern already
  picks it up; a variable outside those prefixes needs the Makefile pattern extended.
- `AI_PROFILES_JSON`, `AI_TASKS_JSON`, and `AI_MAX_CONCURRENCY` are required by the AI service
  configuration reader, but the **video routes never call the AI service**, so a running video-only
  backend does not exercise them. Configuration is read when the service factory runs; restart the
  process after changing any value.

## Endpoint reference

All paths below are relative to the backend root (`http://127.0.0.1:4000` by default; `PORT`, `APP_URL`,
and `CORS_ORIGIN` come from the `env:` target). **Every route is registered with `{ auth: true }`**:
it requires `Authorization: Bearer <supabase access token>`. A missing or invalid token returns
`401 { "error": "Unauthorized." }`. Ownership is always derived from the session, never from the
request body or path.

Errors are normalized: the body is `{ "error": <safe message>, "code": <code> }` and the message is
always a fixed template from a `VideoError`, never provider or database text. A few templates
interpolate server-owned identifiers only — a project status, a required brief field name, or a
storyboard problem code — never user content, prompts, signed URLs, or image bytes. The
code-to-status mapping is in `apps/backend/src/plugins/errors.ts`:

| `code` | HTTP |
|---|---|
| `video_project_not_found` | 404 |
| `video_render_job_not_found` | 404 |
| `video_version_not_found` | 404 |
| `video_input_invalid` | 422 |
| `video_asset_invalid` | 422 |
| `video_asset_limit_reached` | 422 |
| `video_state_conflict` | 409 |
| `video_approval_incomplete` | 409 |
| `video_revision_quota_exhausted` | 409 |

A malformed JSON body, a body that fails the route's zod `.strict()` parse, or an unparseable
request returns `422 { "error": "Invalid request." }`. An unhandled error returns
`500 { "error": "Internal server error." }`.

**A render job's failure is not an HTTP status.** When a render fails, the worker writes a code from
a separate closed set onto the job row, and clients read it from
`job.errorCode` on `GET …/render-jobs` or `GET …/render-jobs/:jobId`. That set is
`RENDER_FAILURE_CODES` in `apps/backend/src/domain/video/errors.ts`, and it is deliberately not part
of `VideoErrorCode`: these codes never answer a request, and mapping them to statuses would invent a
meaningless one. The complete set is:

| `errorCode` | What happened |
|---|---|
| `render_input_unsupported` | The frozen snapshot is not one this deploy understands, or the approved brief/storyboard/asset it names is no longer available. |
| `render_asset_missing` | An asset the manifest froze could not be read from storage. |
| `render_asset_mutated` | An asset's bytes no longer match the `sha256` frozen at intake. |
| `render_engine_failed` | The engine could not produce a video, including an aborted render. |
| `render_engine_unavailable` | Reserved for a cloud render service; the local engine never emits it. |
| `render_timeout` | The render exceeded `RENDER_JOB_TIMEOUT_MS` and was aborted. |
| `render_output_invalid` | The encoded file could not be read, or its width, height, duration, or frame rate disagreed with the manifest. |
| `render_output_too_large` | The encoded file exceeds `VIDEO_MAX_RENDER_OUTPUT_BYTES`. |
| `render_upload_failed` | The MP4 could not be written to storage. |
| `render_stale` | The worker died mid-render and the reclaimer failed the job. |
| `render_worker_shutdown` | The worker stopped while holding the job. |

Every code except `render_stale` originates in the worker; `render_stale` is written by the
reclaimer. `error_code` is never an exception message, a stack trace, or a HyperFrames diagnostic
string.

### Routes

| Method | Path | Auth | Request | Success response | Error statuses |
|---|---|---|---|---|---|
| `POST` | `/video-projects` | Bearer | `{ title, videoType, styleId, settings }` (strict) | `201 { project }` | 401, 422 |
| `GET` | `/video-projects` | Bearer | — | `200 { projects: [project] }` | 401 |
| `GET` | `/video-projects/:projectId` | Bearer | — | `200 { project }` | 401, 404 |
| `DELETE` | `/video-projects/:projectId` | Bearer | — | `200 { pendingObjectDeletions }` | 401, 404 |
| `POST` | `/video-projects/:projectId/messages` | Bearer | `{ content, assetIds? }` (strict) | `201 { message, project }` | 401, 404, 422 |
| `GET` | `/video-projects/:projectId/messages` | Bearer | — | `200 { messages: [message] }` | 401, 404 |
| `POST` | `/video-projects/:projectId/approve` | Bearer | — (no body) | `200 { project, approval }` | 401, 404, 409 |
| `POST` | `/video-projects/:projectId/assets` | Bearer | raw image bytes + headers (below) | `201 { asset }` | 401, 404, 409, 422 |
| `GET` | `/video-projects/:projectId/assets` | Bearer | — | `200 { assets: [assetWithPreview] }` | 401, 404 |
| `DELETE` | `/video-projects/:projectId/assets/:assetId` | Bearer | — | `200 { deleted: true }` | 401, 404, 409 |
| `POST` | `/video-projects/:projectId/render-jobs` | Bearer | `{ idempotencyKey }` (strict) | `201 { job }` new / `200 { job }` replay | 401, 404, 409, 422 |
| `GET` | `/video-projects/:projectId/render-jobs` | Bearer | n/a | `200 { jobs: [job] }` (the newest job, or an empty list) | 401, 404 |
| `GET` | `/video-projects/:projectId/render-jobs/:jobId` | Bearer | — | `200 { job }` | 401, 404 |
| `POST` | `/video-projects/:projectId/render-jobs/:jobId/cancel` | Bearer | — (no body) | `200 { job }` | 401, 404, 409 |
| `GET` | `/video-projects/:projectId/versions` | Bearer | — | `200 { versions: [version] }` | 401, 404 |
| `GET` | `/video-projects/:projectId/versions/:versionId/download` | Bearer | — | `200 { url }` | 401, 404 |

The routes are assembled in `apps/backend/src/routes/video.ts` and mounted in
`apps/backend/src/app.ts`.

### Request and response shapes

- **`POST /video-projects`** body:
  `{ title: string (1–120), videoType: "product_promo" | "discount_promo" | "product_launch" | "menu_showcase", styleId: "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark", settings: { durationSeconds: 6 | 10 | 15, aspectRatio: "9:16" | "1:1" | "16:9", resolution: "720p" | "1080p", language: string (2–12, must be a supported language), voiceOverEnabled: boolean, musicEnabled: boolean } }`.
  `userId`, `status`, `id`, and `version` are server-owned; the strict schema rejects them.
- **`project`** response object: `{ id, title, videoType, styleId, status, settings, revisionRenderCount, createdAt, updatedAt }`.
  It never contains `user_id`, object keys, or signed URLs.
- **`POST …/messages`** body: `{ content: string, assetIds?: string[] }`. `role`, `user_id`, and
  `created_at` are server-owned and rejected by the strict schema. `message` response:
  `{ id, role, content, assetIds, controls, createdAt }`.
- **`POST …/approve`** takes no body and returns `{ project, approval }`, where `approval` is the
  frozen `ApprovalSnapshot` (`video-approval@v1`): schema version, `approvedAt`, the brief and
  storyboard revision ids and versions, `videoType`, `styleId`, `settings`, and the provenance
  (`promptVersion`, `profileId`, `provider`, `model`).
- **`POST …/assets`**: the body is the raw image, not JSON. Send `Content-Type: image/jpeg`,
  `image/png`, or `image/webp` (required), optionally `Content-Length` (rejected over 10 MB if
  declared), and `X-Asset-Rights-Confirmed: true` (required; otherwise `422 video_input_invalid`).
  Success returns `{ asset: { id, mimeType, byteSize, width, height, moderationStatus } }`.
- **`GET …/assets`** returns each asset plus a `previewUrl` field, a short-lived signed URL minted
  for this request.
- **`POST …/render-jobs`** body: `{ idempotencyKey: string }` (8–200 chars). `userId`, `status`, and
  the `input_snapshot` are server-owned and rejected by the strict schema. Returns
  `{ job: { id, status, isRevision, attempts, queuedAt, startedAt?, finishedAt?, errorCode?, createdAt } }`.
  An idempotent replay returns `200` with the job the first request created; a new job returns `201`.
- **`GET …/versions`** returns each version with a `playbackUrl`; **`…/download`** returns
  `{ url }`. Both URLs are signed per request after an ownership check.

## State machine

Project statuses (`video_projects.status`) and the transitions the backend enforces
(`apps/backend/src/domain/video/state-machine.ts`):

```text
draft            -> interviewing | moderation_blocked | failed | deleted
interviewing     -> awaiting_approval | moderation_blocked | failed | deleted
awaiting_approval-> interviewing | approved | moderation_blocked | failed | deleted
approved         -> rendering | moderation_blocked | failed | deleted
rendering        -> ready | approved | moderation_blocked | failed | deleted
ready            -> revision_draft | moderation_blocked | failed | deleted
revision_draft   -> awaiting_approval | moderation_blocked | failed | deleted
moderation_blocked-> deleted
failed           -> deleted
deleted          -> (terminal)
```

The same target status is treated as idempotent; any other move raises `video_state_conflict`. The
PRD's "any active state → `moderation_blocked` | `failed` | `deleted`" rule is honoured for
`rendering` and `ready` too.

**The deliberate realisation of the PRD diagram.** The PRD draws `revision_draft -> rendering`.
Stories 4 and 6 both require explicit approval before any render, so the revision path is realised
as:

```text
revision_draft -> awaiting_approval -> approved -> rendering
```

A project can never render straight out of `revision_draft`.

**The cancellation transition.** `rendering -> approved` is the only way back out of `rendering`
other than completion, failure, moderation, or deletion. It exists so that a render job cancelled
while it is still `queued` releases the project to `approved`, letting the user render again without
spending a rerender. There is a dedicated test for it in `state-machine.test.ts`.

### Render job statuses

`video_render_jobs.status` is `queued -> preparing -> rendering -> uploading -> succeeded`, with
`failed` and `cancelled` as terminal states. Only `queued`, `preparing`, `rendering`, and `uploading`
count as active (a partial unique index, `video_render_jobs_active_project_idx`, permits at most one
active job per project). `queued -> preparing` is the conditional claim the worker's
`beginRenderJob` performs. The worker that advances the rest of the sequence is documented under
"Render pipeline".

A client that has no job id asks `GET /video-projects/:projectId/render-jobs` for the newest job (as a
one-item list, so the shape matches `GET …/versions` and history can arrive later without a breaking
change). A project with no render returns `{ "jobs": [] }`.

## Revision quota rules

The PRD caps rerenders after the first successful render at three
(`MAX_RERENDERS_PER_PROJECT = 3`, `apps/backend/src/domain/video/limits.ts`; the column check is
`revision_render_count between 0 and 3`).

**What consumes a rerender:** `beginRenderJob` on a job whose `isRevision` is true. A job is a
revision when a `video_versions` row already exists for the project. The rerender is spent inside
`beginRenderJob` — i.e. when the worker actually claims the job (`queued -> preparing` wins the
conditional update) — and only then. The counter is incremented by `consumeRerender`, which raises
`revision_render_count` only while it is below three and returns null once it is at the limit.

**What does not consume a rerender:**

- **A system failure.** A job that fails before the worker starts spends nothing.
- **A cancellation while queued.** `cancelRenderJob` only succeeds while the job is still `queued`;
  it never calls `consumeRerender`, and it returns the project to `approved`.
- **A refused fourth rerender.** `createRenderJob` checks the quota before any write, so a fourth
  revision attempt when the counter is already three changes nothing.

Be aware of the dataflow split, because it is asymmetric by design:

- At **intake** (`createRenderJob`), the quota is checked against `project.revisionRenderCount` when
  the render supersedes an existing version; if it is already three, the route returns
  `409 video_revision_quota_exhausted` and no job row is written.
- At **claim** (`beginRenderJob`), the quota is consumed. If the counter raced to three before the
  claim, the job is failed with `error_code = "video_revision_quota_exhausted"` and the same error is
  raised.

**What the user sees when the quota is spent.** The render-jobs intake responds with
`409 { "error": "This project has used all three rerenders.", "code": "video_revision_quota_exhausted" }`.
The frontend plan is expected to use that to disable the rerender control and explain the limit
(PRD Story 6). Note that the **assistant-designed UI copy is not part of this foundation**; only the
machine-readable code exists today.

## Deletion semantics

`DELETE /video-projects/:projectId` (and asset deletion) is **soft-first, object-removal best
effort**:

1. Rows are soft deleted first: the project gets a `deleted_at` and `status = 'deleted'`, and each
   live asset row gets a `deleted_at`. After this, the project and its assets read as not found to
   the owner.
2. Objects are then removed from Storage on a best-effort basis. Each asset object and each version
   object is deleted independently; a storage outage does not fail the request and does not leave
   the project readable.
3. The response reports how many object deletions still have to happen:
   `{ "pendingObjectDeletions": <n> }`. That is the number of failed object removals for this
   request — the reconciliation signal a later pass keys off via the retained `deleted_at` rows.

A second delete of an already-deleted project is idempotent and returns
`{ "pendingObjectDeletions": 0 }`.

**Retention and backup policy is still TBD in the PRD.** The PRD (Story 7 acceptance criteria, and
its Open Decisions list) states that the deadline for completing physical deletion and the backup
policy are set by a retention policy that is **TBD**. This foundation does not implement any
retention window, backfill, or reconciliation job; it only records `deleted_at` so such a job can be
written later.

## Storage

The product has **one** object store: a single private Supabase Storage bucket shared by the
AI-service assets, the project image assets, and the rendered versions.

- **One private bucket, `assets`** (`SUPABASE_ASSET_BUCKET` override), created by
  `apps/backend/supabase/migrations/20260921000000_create_video_asset_bucket.sql` and widened by
  `20260922000000_allow_video_version_objects.sql`. `public = false`. The render plan changed two
  facts about it, because the original images-only, 10 MB bucket would have rejected every MP4:
  - **Allowlist** is now `image/jpeg`, `image/png`, `image/webp`, `video/mp4`.
  - **Ceiling** is now `524288000` (500 MB), matching `VIDEO_MAX_RENDER_OUTPUT_BYTES`.
  Supabase rejects `delete from storage.buckets`, so a bucket cannot be renamed from a migration; if
  a database already ran an earlier revision of that migration under the name `video-assets`, create
  `assets` there through the Storage API (or set `SUPABASE_ASSET_BUCKET=video-assets` on that
  environment) rather than expecting a migration to move it.
- **Both asset families live in that one bucket, separated by key prefix** (keys are internal,
  never a canonical reference the client sees):
  - AI-service asset: `ai-assets/<userId>/<id>.<ext>` (`.jpg` for JPEG, otherwise the subtype),
    built by `makeObjectKey` in `apps/backend/src/application/ai-service/register-asset.ts` and
    read/written through the same `AssetObjectStore`/`SupabaseAssetObjectStore` implementation.
  - project asset: `video-projects/<projectId>/<assetId>.<ext>` (`.jpg` for JPEG, otherwise the
    subtype), built by `objectKeyFor` in `apps/backend/src/application/video/assets.ts`.
  - version: `video-versions/<projectId>/<versionId>.mp4` (the render plan's worker writes these).
- **Signed URLs are generated per request and never stored.** `createSupabaseSignedUrlFactory`
  (`apps/backend/src/infrastructure/video/supabase-signed-urls.ts`) mints a URL with a 300-second TTL
  after the caller's ownership has been checked. A signed URL appears in a response
  (`previewUrl`, `playbackUrl`, `{ url }`) but is never persisted as a column value.

## Render pipeline

The worker is a **second, independently runnable entry point** in the same package:
`apps/backend/src/worker/index.ts`, started with `pnpm --filter backend worker` (`bun
src/worker/index.ts`). It is not part of the HTTP server, it does not import `@/app.ts`, `@/routes/**`,
or `@/plugins/**`, and it **opens no listener** (verified). A long render therefore cannot hold a
request open, and the PRD's "separate job boundary" is satisfied without a queue service.

`SIGINT` and `SIGTERM` stop it gracefully: the in-flight render is **aborted** through HyperFrames'
own cancellation path rather than being killed mid-encode, so no Chrome or FFmpeg process is left
behind. That interrupted job fails with `render_worker_shutdown` and its project is released back to
`approved`, so a redeploy costs the user nothing but a rerender of that job.

`pnpm --filter backend render:smoke -- --aspect-ratio 9:16 --resolution 720p --duration 6` is the
operator's "does this host render?" command. It goes through the real engine, the real producer, and
the real FFprobe probe, but not through the API or Supabase, and it prints the probe it measured.
Pass `--keep` to leave its work directory in place.

### The claim model, and why two replicas are safe

- Two workers cannot render the same job. `beginRenderJob` claims with a **conditional**
  `queued -> preparing` update, and only the update that matches the row wins. The loser re-reads the
  row, sees an active status, and returns the job without spending anything.
- Every later transition is conditional on the status it expects
  (`preparing -> rendering`, `rendering -> uploading`, `uploading -> succeeded`) through one shared
  helper, so a job the reclaimer failed or a user cancelled cannot be resurrected by a worker holding
  a stale row. A null return means "this worker no longer owns the job" and the worker stops quietly
  (`status: "skipped"`) without failing anything.
- `video_versions.render_job_id` is unique, so even a pathological double-claim cannot write two
  version rows for one job.
- `RENDER_WORKER_CONCURRENCY` defaults to 1: one worker process renders one job at a time. Safety
  across processes comes from the conditional updates, not from a lock.

### The job lifecycle

```text
queued -> preparing -> rendering -> uploading -> succeeded
                            |
                            +-> failed | cancelled    (terminal)
```

`preparing` covers writing the composition and re-verifying the asset bytes; `rendering` covers the
engine; `uploading` covers the MP4 write. The write order at the end is deliberate: the object is
uploaded before the version row, and the row before the job is marked succeeded. A crash between any
two of them leaves a retryable state (an orphan object, or a version whose job reads as failed),
never a project that cannot be rendered.

### The staleness rule

A job that was started and then abandoned (the worker died, the host rebooted, the container was
evicted) would otherwise sit in an active status forever, and because
`video_render_jobs_active_project_idx` counts those statuses as active, the project could never be
rendered again. So:

- The worker reclaims before its first claim, and again on a timer inside the loop: every
  `max(RENDER_WORKER_POLL_MS, RENDER_STALE_JOB_MS / 2)`, so a replica that stays up rescues a peer's
  abandoned job within about one and a half staleness windows. `listStale` selects only jobs that are
  in an active status **and** have a non-null `started_at` older than `now - RENDER_STALE_JOB_MS`; a
  `queued` job has never started and belongs to the claim loop, not the reclaimer.
- Each reclaimed job is failed with `render_stale` and its project is released back to `approved`, so
  the user can simply render again.
- `RENDER_STALE_JOB_MS` **must exceed** `RENDER_JOB_TIMEOUT_MS`. A reclaimer quicker than the render
  timeout would fail jobs that are still legitimately rendering, which is indistinguishable to the
  user from a render that vanishes. `readRenderWorkerConfig` refuses such a configuration at startup.

### What a job snapshot freezes (`render-input@v2`)

The job's `input_snapshot` is strict, and the render plan raised it from `render-input@v1` to
**`render-input@v2`**. v1 did not name a template or a frame rate. A v2 snapshot holds:

| Field | Why it is frozen |
|---|---|
| `schemaVersion` | `"render-input@v2"`. A snapshot written by an older or newer deploy is refused with `render_input_unsupported` instead of being partially understood. |
| `briefRevisionId`, `storyboardRevisionId` | The revisions the user actually approved. The worker reads these, never "latest", so a later revision cannot change what a queued job renders. |
| `styleId` | The project's style at intake. |
| `settings` | Duration, aspect ratio, resolution, and language. The frame size is derived from these. |
| `variantSeed` | The deterministic variation seed, minted once, which is what makes a rerender reproducible. |
| `templateId`, `templateVersion` | The template chosen at intake. A registry edit cannot change what an already-queued job renders. |
| `stylePackVersion` | The style pack's version, so a `video_versions` row can name what it rendered with. |
| `fps` | The frame rate, read from the same config the worker uses. |

### Failure vocabulary

See the `RENDER_FAILURE_CODES` table under "Endpoint reference". A render failure never becomes an
HTTP status: the code lands on `job.error_code` and the client reads it from `job.errorCode`.

### Determinism

The composition is fully offline (no `http://` or `https://` reference in the emitted HTML, CSS, or
JavaScript), all model- and user-authored text is HTML-escaped, and user text never reaches emitted
JavaScript. Both are asserted by tests. On one host and one capture mode, two renders of the same
manifest produce byte-identical files (verified). See
`docs/decisions/2026-09-21-hyperframes-render-engine.md` for the caveat about Docker differing from a
native render.

### Known limitations

1. **The MP4 is silent.** No TTS and no music provider is wired, so the rendered file has no audio
   stream. `musicEnabled` and `voiceOverEnabled` do not yet produce sound.
2. **Captions are burned in as text.** `voiceOverEnabled` is what makes the storyboard carry
   `caption` text; the renderer draws it on screen rather than speaking it.
3. **Moderation does not gate a render.** `moderation_status` stays `pending`; the worker renders
   assets whose status is `pending` or `allowed` and refuses `blocked`.
4. **A revision render that fails after its claim still spends a rerender.** `beginRenderJob`
   consumes one of three rerenders the moment the claim wins, and there is no refund path. The
   project is released so the user can retry, but the counter is not restored. This is asserted by a
   test, not "fixed".
5. **The revision path is unreachable from the UI.** `revision_planner` does not exist, so a project
   cannot reach `revision_draft` through the product. The rerender quota is nevertheless enforced by
   the intake and the claim, and this is tested.
6. **No thumbnails, no rate limiting, and no cloud rendering.** The worker runs on the host; moving
   it to a cloud renderer is what the `RenderEngine` port exists for, and nothing here prevents it.

## Not yet wired

- **Moderation status starts at `pending`.** `video_project_assets.moderation_status` defaults to
  `'pending'` and the value set is `pending | allowed | blocked`. `ProjectAssetResolver.resolve`
  currently admits `pending` (and refuses `blocked`). **The AI orchestration plan must gate reads on
  `allowed`** in the same change that adds the moderation provider call.
- **Multi-image analysis is not implemented.** An asset is resolved one at a time by `assetId`; the
  provider contracts cap `maxImages`, but the video flow does not build a multi-image request.
- **The current `openai-responses` adapter is non-streaming.** Streaming is outside the AI service
  contract. Text, vision, and native structured-output support remains controlled by profile
  capability flags for the configured gateway and model.
- **The interviewer answer is generated, but not by this plan's work.** The interviewer and planner
  tasks run through the AI service inside `POST /video-projects/:projectId/messages`, and they need a
  working `AI_PROFILES_JSON` / `AI_TASKS_JSON` configuration. The moderation call is still absent.
- **No audio.** The render pipeline produces a silent MP4: TTS and music are `TBD` in the PRD. See
  "Known limitations" under "Render pipeline".
- **Rate limiting is not implemented.** Upload, chat, approval, and render are not rate-limited and
  this is deferred to the AI-orchestration/ops plan, because the PRD specifies no limits or store and
  the eventual deployment is multi-process.
