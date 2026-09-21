# Chat video generator — backend foundation

This is the operator and API reference for the chat-based AI video generator backend that lives in
`apps/backend`. It documents the surface that Tasks 5–13 of the
`2026-09-21-chat-video-generator-backend-foundation` plan built: private Supabase Storage for
project assets, the `video_*` schema, the project state machine, and the authenticated HTTP API for
projects, assets, chat messages, brief/storyboard revisions, approval, render-job intake, and
version listing/download.

The PRD this implements is `docs/prd/chat-based-ai-video-generator-mvp.md`.

## Scope

This foundation is the server-side data and API layer only. It persists and validates everything a
render will eventually need, and it hands a durable job row to a worker that does not exist yet.

**What this foundation does:**

- Stores project image assets in a private Supabase Storage bucket, behind the existing
  provider-neutral `AssetObjectStore` interface.
- Owns the complete `video_*` schema in Postgres, with row-level security, browser-role revocation,
  column-scoped grants, and `@visuala/db` row types.
- Models the video domain: output settings and validation, style presets, the render-compatibility
  allowlist, the project state machine, and the brief/storyboard schemas with completeness,
  provenance, and timing validation.
- Serves the PRD API surface over authenticated Elysia routes: projects, assets, messages,
  brief/storyboard revisions (internal use cases), approval, render-job intake/cancel, and version
  listing/download.

**What this foundation explicitly does NOT do:**

1. **It never calls a model.** No provider request is made anywhere in this code. The assistant
   side of a chat turn is not generated: `POST /video-projects/:projectId/messages` stores the
   user's message and opens the interview, and nothing more. The AI service still registers only the
   `google-generate-content` adapter, and it has no production caller in the video flow.
2. **It never renders video.** `POST /video-projects/:projectId/render-jobs` writes an immutable
   `video_render_jobs` row and moves the project to `rendering`; it does not install, invoke, or
   depend on HyperFrames. No worker process exists, so no job is ever picked up, and no MP4 is ever
   uploaded.
3. **It has no frontend.** Every route is server-to-server or client-to-API; no UI, page, or
   component is added by this plan.

**The three plans that complete the product:**

- **AI orchestration plan** — the `interviewer`, `planner`, `revision_planner`, and `moderation`
  task callers, multi-image analysis, prompt construction, the assistant reply inside
  `POST /video-projects/:projectId/messages`, and the write path that produces brief/storyboard
  revisions via `saveBriefRevision` / `saveStoryboardRevision`.
- **Render plan** — the HyperFrames `RenderEngine`, the template registry and style packs,
  `RenderManifest` construction, the worker process that consumes `video_render_jobs`, MP4 upload,
  and the `video_versions` row that follows it.
- **Frontend plan** — every `apps/app` task.

### Two disclosures that must not be lost

**1. The provider spikes did not run; the 9Router adapter does not exist.**
Tasks 1–4 of this plan — the three technical spikes (9Router API format, HyperFrames render engine,
TTS/music/moderation providers) and the 9Router provider adapter — were parked because this
environment has no 9Router credentials, no HyperFrames install, and no provider accounts. As a
result:

- **No `openai-chat-completions` adapter exists.** `apps/backend/src/infrastructure/ai-service/`
  contains only `google-generate-content-adapter.ts`.
- The AI service still registers a single API format,
  `google-generate-content` (`apps/backend/src/infrastructure/ai-service/config.ts`,
  `registeredApiFormats`). Any profile whose `apiFormat` is anything else fails configuration
  validation (`AI_CONFIG_ERROR`).
- **There are no `AI_9ROUTER_*` variables to set.** They are not read anywhere in the code, so this
  document does not list them. The `/responses` API format has no adapter, and adding a provider
  URL and key to `AI_PROFILES_JSON` without an adapter does not work.
- The three decision records (`docs/decisions/2026-09-21-9router-api-format.md`,
  `docs/decisions/2026-09-21-hyperframes-render-engine.md`,
  `docs/decisions/2026-09-21-media-providers.md`) were never written, and the `docs/decisions/`
  directory does not exist in the repository. These are all **pending the provider spikes**.

**2. `RENDER_SUPPORTED_COMBINATIONS` is an assumption, not a verified result.**
`apps/backend/src/domain/video/render-compatibility.ts` lists all 18 combinations of
3 aspect ratios × 2 resolutions × 3 durations and reports each as supported. This list is a
**placeholder that stands in for the HyperFrames spike**, which never ran: it encodes what the PRD
*wants to offer*, not what any renderer has been proven to produce. Its own comment says the source
is `docs/decisions/2026-09-21-hyperframes-render-engine.md`, a file that does not exist. **No
combination has been proven renderable.** The render plan must reconcile this list against a real
HyperFrames spike — rendering each combination and recording the result — before any combination is
offered to a user. Remove any row the spike cannot produce, together with its test row in
`render-compatibility.test.ts`, and update `settings.test.ts` accordingly.

## Environment

`apps/backend/Makefile`'s `env:` target is the documented way to get a local `.env`. It is
idempotent: if `apps/backend/.env` already exists it prints
`.env already exists - leaving it untouched` and writes nothing. Otherwise it creates `.env` from
`apps/app/.env`, copying `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ASSET_BUCKET`,
`ADMIN_EMAILS`, every `AI_*`, `R2_*`, `BILLING_*`, and `XENDIT_*` value, deriving
`SUPABASE_ANON_KEY` from `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and prepending `PORT`, `APP_URL`, and
`CORS_ORIGIN`. Run it from the repository root:

```bash
make -C apps/backend env
```

There is no `.env.example` in this repository, and none is created by this plan: `apps/backend/.env`
is gitignored (`apps/backend/.gitignore`). Never commit keys or production values.

### Variables this foundation reads

Defaults below are taken from the code, not invented. "No default" means the value is required and
its absence is a configuration error.

| Variable | Default | Meaning |
|---|---|---|
| `SUPABASE_URL` | no default | Supabase project URL. Used by the service-role and user clients. |
| `SUPABASE_SERVICE_ROLE_KEY` | no default | Service-role key. Used **only** inside `application/**/services.ts` factories and `infrastructure/**`. |
| `SUPABASE_ANON_KEY` | no default | Anon/publishable key for the public client used to resolve a bearer token into a session. The `env:` target derives it from `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `SUPABASE_ASSET_BUCKET` | `video-assets` | Name of the private Storage bucket that holds project image assets and rendered versions. Read by `readAssetBucket` in `apps/backend/src/infrastructure/ai-service/supabase-asset-object-store.ts`. |
| `VIDEO_MAX_ASSETS_PER_PROJECT` | `8` | Maximum live image assets per project. Read by `readAssetLimits` in `apps/backend/src/domain/video/limits.ts`. |
| `VIDEO_MAX_PROJECT_ASSET_BYTES` | `41943040` (40 MiB) | Maximum total bytes across a project's live assets. |
| `VIDEO_MIN_IMAGE_DIMENSION` | `200` | Minimum width and height, in pixels, of an accepted image. |
| `VIDEO_MAX_IMAGE_DIMENSION` | `8000` | Maximum width and height, in pixels, of an accepted image. |
| `AI_PROFILES_JSON` | no default | JSON array of connection profiles (text, vision, structured output, limits, optional pricing). Read by `readAIServiceConfiguration`. |
| `AI_TASKS_JSON` | no default | JSON array mapping each of `connection_test`, `interviewer`, `planner`, and `product_analysis` to a profile ID. |
| `AI_MAX_CONCURRENCY` | no default | Positive integer: the initial process-wide AI request cap. A lower task/profile cap tightens the shared limiter and it never loosens until restart. |
| `R2_ACCOUNT_ID` | no default | Cloudflare R2 account id. **The pre-existing `ai_assets` flow still uses R2**; video assets never do. |
| `R2_ACCESS_KEY_ID` | no default | R2 access key id for `ai_assets`. |
| `R2_SECRET_ACCESS_KEY` | no default | R2 secret for `ai_assets`. |
| `R2_BUCKET` | no default | R2 bucket for `ai_assets`. |
| `AI_GOOGLE_API_KEY` | no default | Read indirectly: a profile's `apiKeyEnv` typically names it. The example profile's default credential variable. |
| `AI_GOOGLE_MODEL` | no default | Read indirectly via a profile's `modelIdEnv`. |
| `AI_ALLOW_INSECURE_LOOPBACK` | unset (`false`) | Set to `true` to let the AI service call plain-HTTP loopback endpoints. Intended for tests only. |

Notes:

- `VIDEO_MAX_ASSETS_PER_PROJECT`, `VIDEO_MAX_PROJECT_ASSET_BYTES`, `VIDEO_MIN_IMAGE_DIMENSION`, and
  `VIDEO_MAX_IMAGE_DIMENSION` are the PRD's **proposed MVP defaults**; the PRD leaves the asset
  count, project byte ceiling, and dimension bounds **TBD** pending storage and vision benchmarks.
  A non-numeric value is rejected with `video_input_invalid`.
- The `AI_*`, `R2_*`, and `SUPABASE_ASSET_BUCKET` variables are all copied through by the `env:`
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
`beginRenderJob` performs.

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

- **One private bucket, `video-assets`** (`SUPABASE_ASSET_BUCKET` override), created by
  `apps/backend/supabase/migrations/20260921000000_create_video_asset_bucket.sql`: `public = false`,
  a 10 MB file-size limit, and an allowlist of `image/jpeg`, `image/png`, `image/webp`. No policy is
  added for `anon` or `authenticated`, so only service-role server code can read or write it.
- **Object key conventions** (internal, never a canonical reference the client sees):
  - asset: `video-projects/<projectId>/<assetId>.<ext>` (`.jpg` for JPEG, otherwise the subtype),
    built by `objectKeyFor` in `apps/backend/src/application/video/assets.ts`.
  - version: `video-versions/<projectId>/<versionId>.mp4` (the render plan's worker writes these).
- **Signed URLs are generated per request and never stored.** `createSupabaseSignedUrlFactory`
  (`apps/backend/src/infrastructure/video/supabase-signed-urls.ts`) mints a URL with a 300-second TTL
  after the caller's ownership has been checked. A signed URL appears in a response
  (`previewUrl`, `playbackUrl`, `{ url }`) but is never persisted as a column value.

## Not yet wired

- **Moderation status starts at `pending`.** `video_project_assets.moderation_status` defaults to
  `'pending'` and the value set is `pending | allowed | blocked`. `ProjectAssetResolver.resolve`
  currently admits `pending` (and refuses `blocked`). **The AI orchestration plan must gate reads on
  `allowed`** in the same change that adds the moderation provider call.
- **Multi-image analysis is not implemented.** An asset is resolved one at a time by `assetId`; the
  provider contracts cap `maxImages`, but the video flow does not build a multi-image request.
- **The `/responses` API format has no adapter.** See the first disclosure above: only
  `google-generate-content` is registered, and no `openai-chat-completions` (or `/responses`)
  adapter exists. This is pending the provider spikes.
- The assistant reply, the interviewer loop, prompt construction, and moderation calls are absent
  from `POST /video-projects/:projectId/messages`.
- The HyperFrames render engine, the worker, and MP4 upload do not exist; the render plan owns them.
