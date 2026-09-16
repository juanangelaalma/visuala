# Creative Video F&B MVP Design

Date: 2026-09-14

## Purpose

Implement the Visuala F&B MVP as the first category on a reusable creative
video engine. An authenticated user uploads one product image, describes a
promotion in Indonesian, answers only necessary clarification questions,
chooses one of three AI-generated concepts, reviews a moving 12-second
portrait preview, requests revisions, exports a real MP4, and recovers the
project after refresh.

The implementation continues the authenticated product application in
`apps/app`. The current dashboard is a placeholder, so the chat, project,
preview, and render flows are new subsystems rather than extensions of an
existing video flow.

## Decisions

- Deliver the complete MVP through production-shaped vertical slices.
- Use the existing provider-neutral `AIService` for structured interviewer and
  planner output.
- Keep the orchestration, persistence, preview, and render pipeline generic.
- Implement F&B as a build-time category plugin and editorial v1 as an
  independent build-time style plugin.
- Render asynchronously in a separate Node worker application.
- Install and lock the available Hyperframes version, then use the contract
  documented by that installed version.
- Export is free during the beta. Credit reservation and debit are explicitly
  deferred, so the credit-specific acceptance criteria in the source PRD are
  not part of this implementation.
- Use one immutable composition artifact for both preview and export.
- Use polling rather than streaming for MVP status updates.

## Scope

The implementation includes:

- One owned JPEG, PNG, or WebP image per project, at most 10 MB by default.
- Indonesian prompt and conversational clarification.
- Facts, assumptions, missing required facts, and optional questions.
- Exactly three substantively different concepts and exactly one
  recommendation.
- Four scenes, 12 seconds, portrait 9:16 at a 540 by 960 work resolution.
- Editorial F&B style v1 with curated layouts and deterministic motion.
- Moving, seekable, replayable preview with four scene thumbnails.
- Immutable revisions and composition versions.
- Asynchronous MP4 rendering, progress, retry, playback, and download.
- Project recovery after refresh and stale-job protection.
- Configurable preview/revision and concurrency quotas.
- Ownership isolation, schema validation, safe artifacts, and restricted
  renderer access.
- Timing, usage, cost, attempt, and output metadata needed to measure the MVP.

The implementation excludes:

- AI-generated video footage, image transformation, avatars, music, voice-over,
  and audio synchronization.
- Free-form timeline editing, multiple product images, multiple aspect ratios,
  multiple durations, and social publishing.
- Runtime-installed plugins or admin-authored executable templates.
- Payment, top-up, credit reservation, debit, settlement, or refund.

## Delivery Strategy

Implementation proceeds as compatible vertical slices rather than disposable
prototypes:

1. Project, upload, persistence, interviewer, clarification, and concepts.
2. Selected-concept planning, editorial compiler, and moving preview.
3. Export request, worker lease, real MP4, download, and recovery.
4. Revisions, quotas, stale response protection, security hardening, metrics,
   and three-brief acceptance runs.

Each slice uses the final domain contracts and database model. Later slices
extend behavior without replacing earlier persistence or API shapes.

## Architecture

### Core Domain

`apps/app/domain/creative-video/**` owns stable, provider-neutral contracts:

- `CreativeProject` and project state.
- `ConversationMessage`.
- `Brief` with facts, assumptions, missing required facts, and asset IDs.
- `Concept` with title, hook, angle, four-scene outline, fit reason, and
  recommendation flag.
- `VideoPlan` and `Scene`.
- `CompositionVersion`.
- `ExportRequest` and `RenderJob`.
- Repository, plugin, artifact-store, queue, and renderer interfaces.
- Structured domain errors and legal state transitions.

The core domain does not import Supabase, R2, Next.js, Hyperframes, Gemini, or
React. It does not contain F&B facts or editorial colors.

### Application

`apps/app/application/creative-video/**` contains use cases and orchestration:

- Create project and initial message.
- Analyze or resume a brief.
- Answer clarification questions.
- Select a concept and build a preview.
- Revise an active preview.
- Read an owned project aggregate and status.
- Request an export idempotently.
- Retry the failed stage permitted by current state.
- Resolve an owned download.

Application code depends on core interfaces and receives concrete plugin
registries, repositories, AI adapters, and stores from factories. It validates
expected project revisions before every mutation and rejects stale asynchronous
results.

### Infrastructure

`apps/app/infrastructure/creative-video/**` contains:

- Supabase repositories and row mapping.
- R2 artifact and output storage.
- An adapter from creative-video AI contracts to the existing `AIService`.
- The build-time category and style registries.
- The deterministic composition compiler integration.
- Export queue operations and worker authorization.
- Factories that wire application services without leaking infrastructure into
  use cases.

### Feature And Route Layer

`apps/app/features/creative-video/**` contains server actions, Zod form
schemas, action states, workspace UI, chat cards, concept cards, preview
controls, and render status. The dashboard route loads the owned active project
on the server and renders the responsive workspace.

Route handlers are limited to responses that server actions cannot serve well:

- Isolated composition artifact delivery.
- Pollable project/render status where needed.
- Short-lived owned download redirects.
- Authenticated worker claim, heartbeat, complete, and fail operations, unless
  the worker accesses Supabase through a private service-role repository.

Every route returns stable user-safe shapes and checks ownership or worker
identity.

### Renderer Worker

`apps/renderer-worker` is a separate Node workspace application. It polls for
available jobs, claims one with a lease, renews the lease while rendering,
loads the immutable artifact and allowlisted assets, invokes the locked
Hyperframes toolchain, validates the resulting MP4, uploads it, and marks the
job complete.

The worker does not call the interviewer or planner, choose layouts, or rebuild
the composition. Multiple worker instances can scale horizontally because job
claim and completion are atomic and lease-based.

## Plugin Model

The engine supports independently registered build-time category and style
plugins. Registration is explicit server code, not dynamic executable content
from users or the database.

### Category Plugin

A `CategoryPlugin` exposes:

- Stable `id` and `version`.
- Supported input asset roles.
- Runtime schema for category-specific brief data.
- Interviewer instructions, prompt version, and structured response schema.
- Required/optional fact policy.
- Planner instructions, prompt version, and structured plan constraints.
- A compatibility declaration for supported style capabilities.
- Test fixtures and acceptance examples.

The F&B plugin owns discount, offer, price, date, WhatsApp, and product identity
clarification rules. A future fashion plugin can supply different facts and
planning guidance without changing project orchestration, persistence, queue,
preview delivery, or rendering.

### Style Plugin

A `StylePlugin` exposes:

- Stable `id` and `version`.
- Design tokens and typography requirements.
- Allowlisted layout and motion definitions.
- Scene and text constraints.
- Capability tags, such as numeric offer support.
- A compiler strategy that converts a validated plan into a deterministic
  artifact.
- Artifact runtime dependencies and their locked versions.

The first style is `editorial-v1`, with cream `#FFF4DC`, orange `#FF692E`, lime
`#E6ED62`, dark green `#18271F`, bold type, original product imagery, rails,
scene markers, CTA treatment, and staged entrances. Offer/stat layouts are
available only when referenced facts contain appropriate numeric data.

### Open-Closed Boundary

Adding a new category or style means implementing the relevant interface,
registering it, and adding compatibility and fixture tests. Existing
orchestrator branches must not be edited to recognize categories by ID. The
registry resolves a versioned plugin and rejects unknown or incompatible
combinations.

Plugins remain build-time and allowlisted for type safety, security,
traceability, and reproducible rendering. Runtime plugin installation is not an
MVP requirement.

## Domain Data

Shared fields are relational and typed. Versioned category/style payloads use
JSONB but must pass the runtime schema owned by the exact plugin version before
entering application code.

### Creative Project

- ID and owner user ID.
- Category ID and version.
- Current state and monotonically increasing revision.
- Active concept ID and active composition version ID.
- Failed stage and safe error code when applicable.
- Initial asset ID.
- Preview generation count and configured quota snapshot.
- Created, updated, and stage timestamps.

Project states are:

- `draft`
- `analyzing`
- `needs_input`
- `concepts_ready`
- `building_preview`
- `preview_ready`
- `rendering`
- `completed`
- `failed`

### Conversation Message

Messages are append-only and ordered. They store role, message kind, safe text,
optional asset reference, project revision, idempotency key, and timestamp.
Provider prompts and raw responses are not stored as chat messages.

### Brief Snapshot

Each analysis result creates an immutable snapshot containing goal, product,
typed facts, assumptions, missing required questions, optional questions,
fact provenance, asset IDs, plugin schema version, and source project revision.
Facts distinguish user-supplied values from cautious visual observations and
goal assumptions.

### Concept

Concepts belong to one brief snapshot and contain an immutable ID, title, hook,
angle, four-scene outline, fit reason, recommendation reason, recommendation
flag, order, and generation metadata. A database/application invariant requires
exactly three concepts and exactly one recommended concept for a completed
concept set.

### Video Plan And Composition Version

The plan records schema version, category/style IDs and versions, 12-second
duration, 9:16 aspect ratio, four scenes, fact references, and source concept.
Each scene records an allowlisted layout ID, duration, concise text, asset ID,
fit mode, optional focal point, and allowlisted motion ID.

A composition version stores project ID, sequential version, immutable plan
snapshot, artifact object key, content hash, asset-version manifest,
validation status, source project revision, and timestamps. Revisions create
new rows and never mutate a version that can be previewed or exported.

### Export Request And Render Job

An export request identifies an immutable composition version and an
idempotency key. Beta price is zero and no credit records are created. A unique
constraint prevents duplicate requests for the same owner/key and ensures
repeated submissions return the original request.

A render job stores status, attempts, progress, lease owner/expiry, heartbeat,
output asset ID, error stage/code, timestamps, and renderer/toolchain versions.
Retries reuse the export request and composition version.

## State And Idempotency Rules

- Initial submit persists project, image association, and message before AI
  work begins, so the UI can show `analyzing` immediately.
- Every mutation supplies the project revision it was based on. The repository
  updates only if the expected revision and owner match.
- AI jobs capture their source revision. A result that completes after a newer
  answer or revision is stored is discarded and cannot overwrite active data.
- A clarification answer appends a message and runs the interviewer again with
  existing facts and ordered conversation context.
- Selecting a concept snapshots that choice before planning starts.
- Revision always creates a new brief/plan/composition lineage and invalidates
  prior approval/export eligibility without deleting old versions.
- Export locks to the exact composition shown to the user.
- Worker claim, heartbeat, completion, and terminal failure use atomic database
  functions or compare-and-set updates.
- A lost worker lease makes the same job claimable after timeout. Completion is
  accepted only from the active lease holder and only once.
- `failedStage` identifies analysis, planning, compilation, or rendering so
  retry repeats only the failed operation.

## Interviewer And Planner

The creative-video AI adapter calls `AIService.generateStructured` with the
existing allowlisted `interviewer` and `planner` tasks. Requests contain
authenticated user/project context, server-owned instructions, ordered safe
messages, at most one owned asset ID, stable prompt versions, and caller-owned
Zod schemas.

The F&B interviewer:

- Treats image and prompt content as data, never system instructions.
- Distinguishes user facts, cautious visual observations, and assumptions.
- Requires only facts needed to fulfill the stated request.
- Requests discount amount/rules for a discount brief.
- Requests a concrete price for a `harga mulai` claim.
- Requests a valid number/link when WhatsApp will appear.
- Resolves ambiguous relative promotion dates.
- Does not invent price, phone, flavor, ingredients, certification, health
  claims, discount, location, or period.
- Does not repeat answered questions unless facts conflict.
- Can assume vague sales content aims to obtain orders, but exposes that
  assumption for correction.

When the brief is sufficient, concept generation produces exactly three
substantively different concepts. Each has a different hook and scene pattern
where context permits; only one is recommended, and recommendation copy avoids
guaranteed-sales claims.

The planner produces structured scene intent and fact references, not HTML or
JavaScript. The style compiler makes final allowlisted layout and motion
choices.

## Composition And Preview

The compiler accepts only a runtime-validated plan and registered plugin
versions. It clamps or rejects text outside style limits, escapes all text,
validates every asset/layout/motion ID, and resolves crop behavior without
stretching the image. Unsafe framing uses `contain`. Low-resolution images
produce a visible quality warning in the product UI.

The output is an immutable Hyperframes artifact and manifest with a content
hash. The manifest references only internal asset IDs/object keys resolved by
trusted infrastructure. Model output cannot inject HTML, scripts, URLs, file
paths, or dependencies.

Preview delivery uses a restricted origin or route with a strict CSP and an
iframe sandbox that does not combine `allow-scripts` with `allow-same-origin`
against the application origin. Parent/player communication uses a small
allowlisted message protocol for ready, play, pause, seek, replay, time, and
error events. The preview is seekable and replayable and exposes four scene
thumbnail seek points.

## Rendering

Before implementation, inspect the documentation and source for the exact
installed Hyperframes version. Lock the CLI/runtime and browser/render
dependencies in the workspace and worker image.

The worker:

1. Claims one queued job using an atomic lease.
2. Loads only the stored composition artifact and versioned asset manifest.
3. Resolves only owned, allowlisted R2 object keys; arbitrary URLs, metadata
   addresses, internal network access, and path traversal are prohibited.
4. Renders 540 by 960 at the exact 12-second timeline without changing layout
   viewport semantics.
5. Maintains heartbeat and bounded progress updates.
6. Applies a configured timeout and bounded attempts.
7. Runs `ffprobe` to verify a playable MP4, dimensions, duration tolerance,
   codec/container metadata, and non-empty video stream.
8. Uploads the output and atomically completes the active lease.
9. Marks a safe failure and releases the lease on terminal error.

The export always renders the previewed artifact; it does not call AI or
compile again. A retry renders the same artifact and remains free.

## UI Design

The dashboard retains the existing dark Visuala shell. Desktop uses a chat
workspace on the left and a portrait preview panel on the right. Mobile uses
explicit Chat and Preview tabs so controls remain usable without squeezing the
video.

The interaction states are:

- Empty composer with one-image upload, Indonesian prompt, validation, and
  submit.
- Optimistic persisted message/photo and `Memahami produkmu...` analysis state.
- One grouped clarification card with natural-language answer input.
- Three concept cards with hook, angle, four-scene summary, fit reason, and a
  clear recommendation badge/reason.
- Preview build state and actionable compiler failure.
- Moving preview with play, pause, replay, scene thumbnails, facts,
  assumptions, quality warning, revision input, and `Export gratis selama
  beta`.
- Render progress with retry behavior.
- Completed MP4 player and owned download action.

The active project ID is represented in the route or stable query state. A
server render loads the complete owned aggregate, while client polling updates
only when revision or `updatedAt` advances. Browser state is not the source of
truth.

## Security

- Authentication is required for every project operation.
- Repositories query by both resource ID and owner ID; RLS provides a second
  ownership boundary.
- New tables enable RLS and define explicit policies. Service-role access is
  confined to infrastructure and the worker.
- Upload validation uses detected magic bytes and decoded dimensions, accepts
  JPEG/PNG/WebP, applies configurable byte/dimension limits, and stores private
  objects under generated keys.
- The AI service receives internal asset IDs, never browser-provided URLs.
- Text and image content cannot alter system instructions, schemas, plugin
  selection, or renderer configuration.
- All structured outputs are validated with Zod and all artifact text is
  escaped.
- Preview CSP and sandbox isolate content from app DOM/auth state.
- The renderer has no general URL/file access and receives no browser auth
  secrets.
- API keys remain server-side. Logs exclude prompts, image bytes, signed URLs,
  provider bodies, and secrets.
- Download URLs are short-lived and created only after ownership checks.

## Errors And Recovery

Domain errors map to stable user-safe action/API states. Raw Supabase, R2,
Hyperframes, process, and provider errors never reach the browser.

- Analysis failure offers retry from the existing message/asset.
- Missing input renders the grouped questions, not a generic failure.
- Planning failure retries against the selected concept snapshot.
- Compilation failure retries from the same validated plan.
- Render failure retries the same composition and export request.
- Expired worker leases recover automatically through re-claim.
- Terminal failures store a safe code and stage plus sanitized diagnostics.
- Revision conflicts cause the client to refresh current project state rather
  than silently overwriting it.
- Exceeded preview quota explains the configured beta limit without charging
  credits.

## Observability

Persist actual timestamps for submit-to-concepts, selection-to-preview, and
export-to-MP4. Store AI request/profile/model/attempt/usage/cost metadata through
the existing AI service records. Store compiler duration, artifact size/hash,
render attempts/progress, worker/toolchain versions, output bytes, verified
dimensions, and verified duration.

Metrics are derived from recorded events. Development estimates must never be
reported as measured production results.

## Testing

Implementation follows red-green-refactor TDD with domain interfaces mocked at
application boundaries.

### Unit Tests

- Legal and illegal state transitions.
- Expected-revision and stale-result rejection.
- Plugin registration, version resolution, and category/style compatibility.
- F&B required/optional fact policy and no-fabrication invariants.
- Interviewer and planner schema validation.
- Exactly three concepts and exactly one recommendation.
- Four scenes totaling 12 seconds.
- Compiler determinism, text escaping, ID allowlists, text limits, layout
  capability checks, and image fit rules.
- Composition immutability and revision lineage.
- Export idempotency and render retry identity.
- Worker lease claim, renewal, expiry, stale completion, and attempt bounds.
- Supabase snake-case to domain camel-case mapping.

### Integration Tests

- Owned upload registration and rejection of invalid/oversized images.
- Project aggregate persistence and recovery.
- Repository ownership isolation and RLS-oriented query behavior.
- AI adapter behavior with a fake `AIService` and validated structured output.
- Artifact write/read integrity and content hashes.
- Queue atomic functions and idempotency constraints.
- Preview CSP, sandbox, and message allowlist.
- Renderer invocation and `ffprobe` validation using local fixtures.

### End-To-End And Acceptance Tests

- A complete sales brief proceeds directly to three concepts.
- A discount brief without its value requests the required fact, then resumes
  without losing image or prior facts.
- Selecting a concept creates a moving four-scene preview.
- Revision creates a new immutable composition and makes the prior version
  inactive.
- Refresh restores messages, concepts, preview/version, and render status.
- Repeated export submission creates one export request and one active job.
- Another authenticated user cannot read project, artifact, status, or output.
- Injection text remains inert in preview and render.
- Three different F&B fixture briefs render to real MP4 files without code or
  layout edits per project.
- `ffprobe` verifies each output near 12 seconds at 540 by 960.
- Key rendered frames are snapshot-compared against the same preview artifact.

Live AI smoke tests are optional, potentially paid, and run only with explicit
authorization and configured credentials. Fixture tests must not be presented
as proof of live model behavior.

## Migration And Deployment

Database changes use new timestamped append-only migrations with constraints,
indexes, RLS, and atomic functions located near the related tables. Existing
AI service migrations remain untouched.

Deployment requires:

- The application with AI service, Supabase, and private R2 configuration.
- A separately scalable renderer worker with service credentials restricted to
  required job/artifact/output operations.
- Locked Hyperframes, browser, FFmpeg, and `ffprobe` versions.
- Configurable AI concurrency, render concurrency, lease duration, render
  timeout, maximum attempts, upload limits, preview quota, and polling
  interval.

The current `pnpm-lock.yaml` has an unresolved merge conflict associated with
unrelated scraper work. It must be resolved without discarding those changes
before Hyperframes can be installed and normal workspace validation can pass.

## Acceptance

The MVP is accepted when:

- Submit immediately persists and displays the image/message and analysis
  state.
- The server produces contextual questions or three real concepts through
  `AIService`.
- Clarification preserves prior context and does not repeat satisfied facts.
- Exactly three distinct concepts appear with one explained recommendation.
- Selection produces a seekable moving preview from a validated immutable
  artifact.
- Revision creates a new version and stale jobs cannot replace it.
- Export asynchronously produces a playable MP4 matching the approved
  artifact, with download and refresh recovery.
- Three F&B fixtures reach verified MP4 outputs without per-project source
  edits.
- Ownership, escaping, idempotency, and failure recovery tests pass.
- Actual latency, AI usage/cost, compiler, and render measurements are stored.

Credit reservation, debit, settlement, release, refund, and double-debit tests
remain unfulfilled by explicit product decision and require a later scoped
design before paid export is enabled.

## Rule Compliance Notes

- The design follows the existing layered architecture and keeps database and
  external-service access in infrastructure.
- Supabase rows remain snake_case and are mapped to camelCase at repository
  boundaries.
- Server actions remain in feature folders, use Zod, and return user-safe
  states.
- Server components remain the default; client components are limited to chat,
  upload, playback, polling, and interaction state.
- Next.js 16.2.9 installed documentation must be checked before implementing
  routes, actions, caching, async request APIs, or runtime declarations.
- Hyperframes documentation/source must be checked after the version is
  installed and before authoring composition or render code.
- Source changes must be followed by `graphify update .`.

## Risks And Follow-Ups

- Hyperframes is not currently installed, so exact artifact and render APIs
  remain intentionally unspecified until the locked package is inspected.
- A separate worker adds deployment and operations work but is required for
  reliable background rendering and horizontal scale.
- JSONB plugin payloads require strict versioned validation on every read;
  skipping this would weaken type and migration safety.
- Build-time plugins require deploys for new categories/styles. Runtime plugin
  administration is a separate security and product problem.
- Process-local AI concurrency is not a global quota; account/project quotas
  and database-backed render concurrency provide the MVP distributed controls.
- Founder visual scoring still requires human evaluation after deterministic
  render tests pass.
- Paid export must not be enabled until a separate atomic credit reservation
  design and migration are implemented.
