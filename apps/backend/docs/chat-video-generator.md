# F&B Promo Video Creator

This is the operator and API guide for the active F&B creator in **Buat Video**. It implements
`docs/prd/F&B Promo Video Creator.md` using `apps/backend/fnb-library`, the authenticated
`/fnb-campaigns` API, and the existing `apps/app` campaign library and editor. The older
`/video-projects` shared storage API remains available; its reference is preserved below and
explicitly marked legacy. Its unfinished chat orchestration and worker are not the active F&B flow.

Credits are intentionally outside this implementation. There is no creator balance, deduction,
credit purchase, or fabricated quota display. AI usage persistence is not a credit ledger. The
legacy three-rerender rule documented below does not apply to F&B render intake.

## Active creator workflow

Create a campaign in `/dashboard/videos/new`, then open `/dashboard/videos/:id`. Campaigns and
saved revisions remain in the existing dashboard library. The brief contains:

| Field | Contract |
|---|---|
| `campaignName`, `productName`, `brandName` | Required trimmed text, at most 100 characters each. |
| `originalPrice` | Positive safe integer in rupiah. |
| `discountPercent` | Integer from 1 through 100. |
| `promoPeriod` | Optional text, at most 100 characters; omitted values become an empty string. |
| `cta` | Required trimmed text, at most 80 characters. |
| `productAssetId` | Required owned campaign image UUID. |
| `logoAssetId` | Owned campaign image UUID or `null`; without a logo, composition uses the brand name. |

The output is fixed: 15 seconds, 1080 × 1920, portrait 9:16, Indonesian promotional copy, without
voiceover or music. Duration, scene order, aspect ratio, and resolution are not editor choices.

| Scene | Start | Duration |
|---|---|---|
| Hook | 0 seconds | 2 seconds |
| Product | 2 seconds | 4 seconds |
| Discount | 6 seconds | 5 seconds |
| End card | 11 seconds | 4 seconds |

`application/fnb/planner.ts` makes a real structured AI request using the `planner` task and
`fnb-campaign-creative@1` schema. The model selects identifiers from server-built factual copy
fragments and one of the allowed presets: Warm Artisan (`warm-artisan`), Night Market
(`night-market`), or Fresh Counter (`fresh-counter`). It cannot return executable HTML, CSS, or
JavaScript. The server resolves choices to submitted names, CTA, period, discount, and prices.
Discounted price uses integer arithmetic with half-up rounding; both prices use rupiah formatting.
Uploaded product/logo images are used in composition, not sent to this planner.

Scene headline, subheadline, CTA, and owned product image can be edited. Reset restores the
selected scene from the persisted initial AI plan; it does not call the provider. Choosing another
style preset changes composition tokens, not the original product or logo colors. API style tokens
accept six-digit hex colors and allowlisted typography, background treatment, and density values;
text requires at least 4.5:1 contrast against the applicable background surfaces. Manual scene copy
also passes the submitted-facts checks in `domain/fnb/campaign.ts`; this is not a general-purpose
fact checker or a moderation provider.

### Save, preview, versions, and approval

Generate and save create a new persisted draft revision. Saving composes the draft and runs an
actual Hyperframes browser check before publishing the latest valid preview. Failed composition or
validation leaves the draft and errors saved, preserves the previous valid preview, and blocks
approval of the invalid revision. Unsaved changes mark preview outdated.

The editor offers play, pause, seek, and scene jumps through the official Hyperframes player. It
loads the authenticated composition as `srcdoc` with the official player runtime, at fixed 9:16
geometry and 15-second timing. The composition source is the saved HTML, not a fresh model result.
Older validated revisions can be previewed. Restoring an older version copies its content into the
local draft; saving creates a new revision and does not silently reapprove it.

Generate, save, and approve use `expectedRevision` compare-and-swap (CAS). The database locks the
campaign and rejects stale writers with `409 video_state_conflict`; a late composition result
cannot replace a newer revision. The editor retains local edits on conflict and lets the user load
the latest server revision before comparing and saving again. Session storage provides best-effort
local recovery, not a substitute for a server save.

Approval requires the latest saved revision, a matching composition hash/revision, no validation
errors, and the user's preview-review confirmation in the UI. It marks that exact version approved.
Subsequent edits produce a new draft and clear current approval without changing the approved
version. An older approved version remains renderable. Editing while a job runs does not change
that job's frozen source.

### Frozen HTML and private assets

The server loads the existing F&B registry, registered component fragments, stylesheet files, and
compatible motion definitions. Composition uses text bindings rather than injecting user HTML,
checks component variants/animation hooks, and embeds the owned image bytes as data URLs. The
saved HTML includes GSAP dependency bytes, seek-safe authored motion, and four owned WOFF2 files
from `apps/backend/fnb-fonts` (DejaVu Sans/Serif, regular/bold). Preserve the accompanying font
license. Preview and render need no remote image, font, or script downloads for the composition.

`fnb_campaign_versions` stores the draft, composition specification/library version, self-contained
HTML, SHA-256 hash, validation flag, and approval timestamp. Database protection prevents
replacement of frozen composition bytes and mutation of an approved version. The worker reads
that exact version and checks its SHA-256 before rendering; it does not regenerate from the current
draft or current library files.

Assets use the shared private Supabase bucket and existing image validation: JPEG, PNG, or WebP,
up to 10 MiB each, rights confirmation required, ownership checked, and bytes/hash/dimensions
rechecked when resolved. Default campaign limits are 8 live images, 40 MiB total, and dimensions
from 200 to 8000 pixels. Storage keys are internal. Asset previews and completed MP4 downloads use
fresh owner-authorized signed URLs with a 300-second TTL, never persisted signed URLs.
The F&B migration expands the default `assets` bucket to 256 MiB and permits `video/mp4` in
addition to images; this does not raise the application image-upload limit. If
`SUPABASE_ASSET_BUCKET` names another existing bucket, configure that private bucket for the same
required MIME types and output size because the migration updates only `assets`.

## Active F&B API

Every route below requires `Authorization: Bearer <Supabase session.access_token>`. The backend
validates the token through Supabase Auth and derives ownership from the resulting user, never a
body field. A Supabase anon/publishable key, service-role key, or 9Router key is not a user access
token. Frontend and backend Supabase URL/key settings must refer to the same running instance.

The UI calls the same-origin `/api/fnb-campaigns/...` bridge. That server route reads the Supabase
session cookie, forwards `session.access_token` to `/fnb-campaigns/...` at `NEXT_PUBLIC_API_URL`,
allowlists routes, and rejects mutating requests whose Origin is not the app origin. Composition
requests use `?format=json` so authenticated HTML can reach the player without putting credentials
in a URL. AI keys remain only in the backend environment; no key is sent to browser code.

| Method | Backend path | Request | Success |
|---|---|---|---|
| `GET` | `/fnb-campaigns/style-presets` | None | `{ presets }` |
| `POST` | `/fnb-campaigns` | `{ title }` | `201 { campaign }` |
| `GET` | `/fnb-campaigns` | None | `{ campaigns }` |
| `GET` | `/fnb-campaigns/:id` | None | `{ campaign, assets, versions, renderJobs }` |
| `POST` | `/fnb-campaigns/:id/assets` | Multipart `file` and `rightsConfirmed="true"` | `201 { asset }` |
| `POST` | `/fnb-campaigns/:id/generate` | `{ brief, expectedRevision }` | `{ campaign }` |
| `PUT` | `/fnb-campaigns/:id/draft` | `{ draft: { brief, plan, style }, expectedRevision }` | `{ campaign }` |
| `POST` | `/fnb-campaigns/:id/approve` | `{ expectedRevision }` | `{ campaign }` |
| `POST` | `/fnb-campaigns/:id/render` | `{ revision, idempotencyKey }` | `{ job }` |
| `GET` | `/fnb-campaigns/:id/render-jobs/:jobId` | None | `{ job }` |
| `GET` | `/fnb-campaigns/:id/composition/:revision` | Optional `?format=json` | HTML or `{ html }`, validated versions only |
| `GET` | `/fnb-campaigns/:id/download/:jobId` | None | `{ url }`, completed jobs only |

JSON request schemas are strict. `expectedRevision` is a nonnegative integer; render `revision` is
positive and `idempotencyKey` is trimmed text of 8 to 200 characters. Campaign responses expose
draft/revision, initial plan, validation errors, composition hash/revision, and approved revision.
Public job responses contain job ID, campaign ID, revision, client idempotency key, status, error,
and timestamps, not Storage keys or dispatch/attempt tokens. The editor reuses the failed job's
revision and idempotency key when retrying, including after a reload.

Invalid auth returns 401; unavailable owned campaigns/jobs/versions return 404; invalid requests or
assets return 422; stale revisions, active-render/idempotency conflicts, and incomplete approval
return 409. Domain errors have `{ error, code }`; AI errors additionally include request ID and
retryability using safe provider-independent messages. Unhandled errors return only
`{ error: "Internal server error." }`. Composition responses are private/no-store, and direct HTML
responses use a restrictive CSP with data-only images/fonts/scripts and no network connections.

## Render intake, recovery, and download

The active worker is `infrastructure/fnb/render-worker.ts`, used by both local dispatch and the
`fnb-campaign-render` Trigger task. Job states are `queued -> rendering -> completed | failed`.
The campaign tracks `draft | approved | rendering | completed | failed`; these are separate from
the backing legacy `video_projects` state machine.

Render intake requires an approved, validated version and permits at most one queued/rendering
job per campaign. Repeating a campaign/idempotency key for the same nonfailed job returns the
existing job without redispatching it. Reusing the key for another revision is a conflict.
Retrying a failed job with the same key retains the job ID but rotates `attempt_token`, clears the
old outcome, and obtains a new dispatch lease. Trigger idempotency uses `jobId:attemptToken`
with a 30-minute TTL, so a failed retry is not suppressed by the previous attempt.

`20261008002000_fnb_render_dispatch_leases.sql` provides the durable handoff:

- Intake reserves a five-minute dispatch lease. Only its matching, unexpired `dispatch_token` can
  fail the still-queued job after enqueue fails; a stale enqueue failure cannot overwrite a
  claimed job or a later dispatcher.
- Worker claim requires `queued` and the matching `attempt_token`, clears dispatch ownership,
  and grants a 25-minute render claim. Duplicate or stale worker deliveries cannot claim again.
- Completion/failure requires `rendering`, the matching attempt, and an unexpired render claim.
  Campaign status changes additionally require the same current revision, approved revision,
  and `rendering` state, so an older job cannot overwrite a newly edited draft.
- Backend startup runs recovery immediately and then every 10 seconds, with no overlapping pass
  in that process. Each database pass takes up to 10 jobs, locks campaign before job, and uses
  `SKIP LOCKED` for competing recovery processes. Queued jobs without a live lease receive a new
  five-minute dispatch lease and are dispatched again; dispatch failure releases only its matching
  lease. Expired rendering claims become failed and can be retried explicitly.

The worker uploads MP4 to
`fnb-renders/<campaignId>/<jobId>/<attemptToken>.mp4` with `upsert: false`, then conditionally
finishes the job. If the completion guard rejects a stale attempt, the worker removes its uploaded
output. Download requires campaign/job ownership and `completed`, then signs the recorded private
object key. Failed or active jobs cannot produce a download URL.

### Local runtime versus Trigger.dev

`FNB_RENDER_DRIVER=local` dispatches the actual renderer asynchronously from the backend process;
it is the nonproduction default, not a fake worker or a Trigger deployment. `trigger` is the
production default and requires `TRIGGER_SECRET_KEY` on the backend and the deployed
`fnb-campaign-render` task. Other driver values are rejected.

The backend itself runs under Bun, but Hyperframes runs as a standalone **Node** child process,
resolved from the installed `hyperframes` package. Keep Node 22 or newer available on `PATH`.
The process wrapper supplies pinned `ffmpeg-static` and `ffprobe-static` binary paths, adds the
FFmpeg directory to `PATH`, and disables Hyperframes telemetry. Environment overrides are
`HYPERFRAMES_FFMPEG_PATH`, `HYPERFRAMES_FFPROBE_PATH`, and `HYPERFRAMES_BROWSER_PATH`;
browser path also falls back to `PUPPETEER_EXECUTABLE_PATH`. A usable Chrome/Chromium installation
with its system libraries is required. Browser-skipped validation is a failure, never approval.

Each check/render writes only the frozen `index.html` into a temporary project and removes it
afterward. Save runs `check --json` with a two-minute deadline, rejecting error findings, contrast
AA failures, browser-skipped checks, and an unsuccessful check result. Render runs
`render --quality delivery --fps 30 --workers 1 --strict --output <temporary output.mp4>` with a
20-minute deadline and checks the output MP4 signature before upload.

`apps/backend/trigger.config.ts` targets `node-24`, a 1500-second maximum, and includes the
Puppeteer build extension, system FFmpeg, external Hyperframes/static binary packages, and
`additionalFiles` for both `fnb-library/**` and `fnb-fonts/**`. The task uses `medium-2x` and
`maxAttempts: 1`; durable recovery and explicit failed-job retry own retries. Do not ship the worker
without the library, owned fonts/license, browser, binaries, and Supabase environment.

Cloud Trigger deployment was **not exercised**. The existing project's `TRIGGER_PROJECT_REF`,
deployment authentication/project access, backend `TRIGGER_SECRET_KEY`, and worker environment
are prerequisites that were not available for cloud verification. The config deliberately fails
without a project reference; do not invent a reference, secret, endpoint, or model to make it pass.
Real local 9Router generation at `http://127.0.0.1:20128/v1` through the OpenAI Responses adapter,
authenticated Supabase uploads, revisions, preview, and approval have been exercised. The actual
local worker also completed an approved revision: the owner-authorized browser download produced
a 723,413-byte H.264 MP4, 1080 × 1920, 30 fps, 450 frames, exactly 15 seconds, without audio.
Its downloaded bytes matched Storage output and preview HTML matched the approved SHA-256.
The browser download sets Supabase's `download` query option so a cross-origin signed URL produces
an attachment, not an inline video navigation.
A real renderer failure followed by the editor's retry completed the same job ID and client key.
The newer revision 7 remained a draft without approval; revision 6's completed download stayed
available. Internal renderer diagnostics stay in server logs; the public failure message offers
retry without exposing machine paths or subprocess output.
This does not establish cloud deployment. A later provider recheck timed out after 30 seconds;
direct access to port 20128 from this WSL session also timed out, while draft and completed output
remained available. Existing matching Supabase settings were retained; provider connectivity is
separate from Supabase authentication and rendering.

## Migrations and command scopes

Use the existing Supabase instance and settings. Apply the migration chain from
`apps/backend/supabase/migrations`, including the shared AI/video tables and bucket, followed by:

1. `20261008000000_create_fnb_campaigns.sql`: F&B campaigns/versions/jobs, owner-scoped reads,
   server-only writes/RPCs, immutable version safeguards, and MP4-capable private default bucket.
2. `20261008001000_accept_fnb_project_style.sql`: preserves existing backing-project style
   constraints while allowing the `bold_pop` metadata used by F&B campaign creation.
3. `20261008002000_fnb_render_dispatch_leases.sql`: removes unguarded intake/failure signatures
   and adds token-guarded dispatch, claim, completion, and recovery RPCs for service-role use only.

Commands below are configuration/operator references, not a record that they were all run:

| From repository root | Scope |
|---|---|
| `make -C apps/backend env` | Create a missing backend `.env` from existing app settings; never overwrite it. |
| `make -C apps/backend supabase-up` | Start the backend-local Supabase CLI project. |
| `make -C apps/backend supabase-status` | Show that local project's status. |
| `make -C apps/backend migrate` | `supabase db push --local --workdir .` in the backend; does not deploy cloud migrations. |
| `pnpm backend:dev` | Turbo backend-only dev target; backend script runs `bun --watch src/index.ts`. |
| `pnpm app:dev` | Turbo app-only Next.js dev target. |
| `pnpm --filter backend start` | Backend without watch, including durable recovery startup. |
| `pnpm --filter backend trigger:dev` | Trigger.dev 4.7.3 development runner from backend scope. |
| `pnpm --filter backend trigger:deploy` | Trigger.dev 4.7.3 deployment from backend scope; requires real project credentials. |
| `pnpm --filter backend ai:check-config` | Offline AI configuration parsing/resolution; no provider request. |
| `pnpm --filter backend ai:smoke:text`, `ai:smoke:structured`, `ai:smoke:vision` | Separate paid provider smoke scripts; authorization and configured owned inputs required. |
| `pnpm --filter backend build` / `lint` | Both currently run `tsc --noEmit`; no compiled server bundle. |
| `pnpm --filter backend test` | Backend Vitest suite. |
| `pnpm lint:anti-slop` | Root Oxlint anti-slop gate, pinned to 1.87.0. |

`make -C apps/backend supabase-reset` and `migrate-fresh` reset the local database; they are
destructive and are not an upgrade procedure for an existing user library. Root `pnpm dev`
starts the broader Turbo graph; use scoped targets when only the creator app/backend are needed.
Default app/backend ports are 3000/4000. The separate current QA services use 3010/4010;
configure app API destination, backend port, app URL, and CORS together rather than touching
unrelated running user services.

## Environment

`apps/backend/Makefile`'s `env:` target is the documented way to get a local `.env`. It is
idempotent: if `apps/backend/.env` already exists it prints
`.env already exists - leaving it untouched` and writes nothing. Otherwise it creates `.env` from
`apps/app/.env`, copying `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ASSET_BUCKET`,
`ADMIN_EMAILS`, every `AI_*`, `BILLING_*`, and `XENDIT_*` value, deriving
`SUPABASE_ANON_KEY` from `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and prepending `PORT`, `APP_URL`, and
`CORS_ORIGIN`. Run it from the repository root:

```bash
make -C apps/backend env
```

There is no `.env.example` in this repository, and none is created by this plan: `apps/backend/.env`
is gitignored (`apps/backend/.gitignore`). Never commit keys or production values.

### Variables read by the creator and shared services

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
| `AI_PROFILES_JSON` | no default | Connection profiles, including registered `google-generate-content` or `openai-responses` protocol, base URL, dynamic key/model variable names, capabilities, and limits. |
| `AI_TASKS_JSON` | no default | Maps each of `connection_test`, `interviewer`, `planner`, and `product_analysis` to a profile ID. F&B generation calls `planner`. |
| `AI_MAX_CONCURRENCY` | no default | Initial process-wide AI request cap. Lower task/profile caps tighten it until restart. |
| Profile `apiKeyEnv` / `modelIdEnv` variables | no default | Actual server-side credential/model values named by the selected profile. No fixed Google or 9Router key/model name is required by the service. |
| `AI_ALLOW_INSECURE_LOOPBACK` | unset (`false`) | Explicit local-development opt-in for plain HTTP loopback, required by the existing `http://127.0.0.1:20128/v1` 9Router profile; not for remote endpoints. |
| `FNB_RENDER_DRIVER` | `local` outside production; `trigger` in production | Active render dispatcher. |
| `TRIGGER_SECRET_KEY` | no default | Backend Trigger dispatch credential when using `trigger`; never a browser variable. |
| `TRIGGER_PROJECT_REF` | no default | Existing Trigger project reference required by the task config for development/deployment. |
| `HYPERFRAMES_BROWSER_PATH` | falls back to `PUPPETEER_EXECUTABLE_PATH` | Usable browser executable for standalone Hyperframes check/render. |
| `HYPERFRAMES_FFMPEG_PATH` | installed `ffmpeg-static` binary | FFmpeg executable override. |
| `HYPERFRAMES_FFPROBE_PATH` | installed `ffprobe-static` binary | FFprobe executable override. |
| `AI_SMOKE_USER_ID`, `AI_SMOKE_ASSET_ID` | no default | Owned test inputs for provider smoke scripts; the asset is needed for vision. |

Notes:

- `VIDEO_MAX_ASSETS_PER_PROJECT`, `VIDEO_MAX_PROJECT_ASSET_BYTES`, `VIDEO_MIN_IMAGE_DIMENSION`, and
  `VIDEO_MAX_IMAGE_DIMENSION` are the PRD's **proposed MVP defaults**; the PRD leaves the asset
  count, project byte ceiling, and dimension bounds **TBD** pending storage and vision benchmarks.
  A non-numeric value is rejected with `video_input_invalid`.
- The `AI_*` and `SUPABASE_ASSET_BUCKET` variables are all copied through by the `env:`
  target's grep pattern. If you add a new variable in one of those families, the pattern already
  picks it up; a variable outside those prefixes needs the Makefile pattern extended.
- F&B generation requires valid AI configuration and profile credentials. The current local
  9Router profile uses `openai-responses`; the server adapter posts to `/responses`. Preserve the
  existing profile/model choice and enter the credential separately. See
  [AI provider service](./ai-provider-service.md) for limits, adapters, and configuration changes.
- `FNB_*`, `TRIGGER_*`, `HYPERFRAMES_*`, `PUPPETEER_*`, and `VIDEO_*` are not copied by the
  Makefile's current prefix pattern. Configure needed runtime values directly in each server
  environment. Restart/redeploy after changes; editing an env file does not update a running
  process or repair mismatched Supabase instances.

## Legacy shared video storage API reference

The sections below describe `/video-projects`, the backing `video_*` tables, and their shared asset
helpers. They preserve the earlier `docs/prd/chat-based-ai-video-generator-mvp.md` API reference,
not the active F&B campaign contract. F&B uses the shared ownership/assets/object store but has
its own versions, approval, render states, worker, and intake rules described above. The legacy
chat-message endpoint still stores user messages without generating an assistant reply; its
`video_render_jobs` queue has no active worker in this implementation.

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

## Legacy project state machine

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
active job per project). `queued -> preparing` is the conditional claim exposed by
`beginRenderJob`; the active F&B worker does not consume this legacy queue.

## Legacy revision quota rules

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

**The legacy quota response.** Render-job intake responds with
`409 { "error": "This project has used all three rerenders.", "code": "video_revision_quota_exhausted" }`
when the legacy quota is exhausted. This is a machine-readable shared API contract, not a balance
or rerender limit in the active F&B UI.

## Legacy deletion semantics

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

## Shared storage and legacy object prefixes

The creator and shared services use a single private Supabase Storage bucket for AI-service
assets, project image assets, and rendered output.

- **One private bucket, `assets`** (`SUPABASE_ASSET_BUCKET` override), originally created by
  `apps/backend/supabase/migrations/20260921000000_create_video_asset_bucket.sql`. The later
  F&B migration retains `public = false`, expands the bucket limit to 256 MiB, and allows
  `image/jpeg`, `image/png`, `image/webp`, and `video/mp4`. Image uploads remain capped at 10 MiB
  by the application. No policy grants `anon` or `authenticated` object access; reads/writes use
  server service-role code.
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
  - legacy version: `video-versions/<projectId>/<versionId>.mp4` (reserved legacy worker convention).
  - active F&B output: `fnb-renders/<campaignId>/<jobId>/<attemptToken>.mp4`.
- **Signed URLs are generated per request and never stored.** `createSupabaseSignedUrlFactory`
  (`apps/backend/src/infrastructure/video/supabase-signed-urls.ts`) mints a URL with a 300-second TTL
  after the caller's ownership has been checked. A signed URL appears in a response
  (`previewUrl`, `playbackUrl`, `{ url }`) but is never persisted as a column value.

## Preserved shared limitations and inactive legacy features

- **Moderation status starts at `pending`.** `video_project_assets.moderation_status` defaults to
  `'pending'` and the value set is `pending | allowed | blocked`. `ProjectAssetResolver.resolve`
  currently admits `pending` (and refuses `blocked`). **The AI orchestration plan must gate reads on
  `allowed`** in the same change that adds the moderation provider call.
- **Multi-image analysis is not implemented in this creator.** Uploaded campaign images are
  composed locally; the F&B planner receives brief/factual fragments rather than image bytes.
- **Both `google-generate-content` and `openai-responses` adapters exist.** The active F&B
  planner uses the configured OpenAI Responses profile through local 9Router. This does not add
  AI orchestration to the legacy message endpoint.
- The assistant reply/interviewer loop and moderation provider calls remain absent from
  `POST /video-projects/:projectId/messages`.
- The active Hyperframes worker consumes `fnb_render_jobs` only. Legacy `video_render_jobs`,
  its version upload path, TTS/music, and its broad output compatibility matrix are not activated
  by the F&B cutover. The creator offers only its fixed 15-second 1080 × 1920 output.
- **Rate limiting is not implemented.** Upload, chat, approval, and render are not rate-limited and
  this is deferred to the AI-orchestration/ops plan, because the PRD specifies no limits or store and
  the eventual deployment is multi-process.
