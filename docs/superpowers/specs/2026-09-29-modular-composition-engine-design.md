# Visuala Modular Composition Engine (MVP)

Date: 2026-09-29
Status: Proposed
Source PRD: `Visuala Modular Composition Engine.md` (v0.3, Simplified MVP)
Plan: `docs/superpowers/plans/2026-09-29-modular-composition-engine.md`
Branch: `feat/hyperframes-render-pipeline`

## Goal

Replace Visuala's fixed-template video worker with a composition engine. AI turns a brief plus a
Design Pack and the HyperFrames catalog into a structured **Composition Spec**; code validates,
compiles, checks, previews it, and renders the **same frozen artifact** to MP4 on approval.

AI never writes HTML/CSS/JS. Code keeps safety (schema, validation, asset access, duration,
compatibility, compilation, rendering). HyperFrames keeps rendering.

## Decisions locked in planning (user-confirmed)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | Full PRD MVP; the whole video pipeline **and** its UI are replaced end-to-end |
| 2 | Compatibility | None with the old worker (PRD §3); the old render pipeline is removed, not kept alongside |
| 3 | Old tables | `video_storyboard_revisions` is dropped; `video_render_jobs` / `video_versions` are recreated with the composition shape. `video_projects`, `video_brief_revisions`, `video_project_assets`, `video_messages`, `video_moderation_events` stay |
| 4 | Recipes | PRD's five: `product_promo`, `discount_promo`, `product_launch`, `menu_showcase`, `storefront_showcase` |
| 5 | Duration | Constraint relaxed from `(6,10,15)` to integer `4..30` (PRD example is 12 s) |
| 6 | Style | One design pack, `creative-mode`; `style_id` check becomes `('creative-mode')` |
| 7 | Design Pack source | `designs/creative-mode/FRAME.md` (+ its frontmatter) is adapted into `design-packs/creative-mode/v1/{frame.md,manifest.json}` |
| 8 | HyperFrames versions | CLI pinned to `hyperframes@0.8.59` to match pinned `@hyperframes/producer` 0.8.59; no upgrade |
| 9 | Fonts | Add `@fontsource/archivo-black`, `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`; no network font at render |
| 10 | Artifact + observability | New tables (do not overload existing jsonb columns) |
| 11 | Antislop | Mode DURING (applied while writing, plus Delivery Gate at the end) |

## Non-goals (PRD §3)

Timeline editor; natural-language revision; AI-authored modules; module review workflow; module
sandbox factory; catalog auto-refresh/cache; composition anti-repetition; multiple concepts;
marketplace components; arbitrary HTML/JS from user prompt; old-worker compatibility. Cloud
rendering, HDR, audio/music pipeline, and 4K stay out.

## Architecture

### Placement

The PRD §26 tree is realised through the backend's existing four-layer convention rather than a
literal `video-engine/` directory, so responsibility boundaries stay identical to the rest of the
service:

```
apps/backend/
  design-packs/creative-mode/v1/{frame.md,manifest.json}   # built-in Design Pack (source of truth for style)
  catalog/{catalog.json,catalog-details.json}              # generated, committed, manually refreshed
  src/domain/video-engine/
    recipes/            # 5 recipes (static, versioned)
    design-pack.ts      # manifest types + token contract
    modules/            # 8 internal modules (HTML/CSS + contract)
    composition.ts      # Composition Spec zod schema + types
    validators/         # schema | catalog | fact | asset | duration | compatibility
    compiler.ts         # Spec -> CompositionSource (index.html + sub-compositions + styles.css)
    fallback.ts         # the stable fallback composition (PRD §14)
  src/application/video-engine/
    design-pack-loader.ts        # resolve built-in / customer pack, freeze version
    art-director.ts              # AI: Art Direction
    catalog-search.ts            # searchCatalog()/inspectCatalogItem() over committed catalog
    candidate-selector.ts        # code-driven candidate shortlist per beat
    composition-planner.ts       # AI: Composition Spec
    validate.ts                  # runs all validators, picks next candidate / fallback
    compile.ts                   # compile + artifact versioning (hashes, versions)
    visual-check.ts              # rule-based visual check
    observe.ts                   # composition event logging
    services.ts                  # factories wiring the above for routes + worker
  src/infrastructure/video-engine/
    fs-design-pack-source.ts     # built-in pack from disk
    supabase-design-pack-source.ts # customer pack from Storage (design-packs/{tenantId}/...)
    hyperframes-cli.ts           # runs pinned npx CLI: catalog / add / check
    composition-artifact-store.ts# artifact bytes to Storage
    hyperframes-render-engine.ts # producer render (replaces the old engine adapter)
    superseded: hyperframes/ (old writer/engine) deleted
  src/routes/video.ts, src/worker/index.ts   # reworked
```

### Pipeline

```
Interviewer (kept)  ->  Recipe Resolver  ->  Design Pack Loader  ->  Art Director (AI)
   ->  Catalog Search (code)  ->  Composition Planner (AI)  ->  Composition Spec
   ->  Validators  ->  Compiler  ->  Visual Check  ->  Frozen Artifact
   ->  Preview (draft MP4 from the frozen artifact)  ->  Approve  ->  Render (delivery MP4)  ->  MP4
```

Only the **artifact** crosses the approval boundary. Approve never re-runs the planner (PRD §19).

### Storage layout

One private Supabase bucket (`assets`) with key prefixes, consistent with today's single-bucket
design; the PRD's literal paths map onto prefixes:

| Purpose | Key prefix | Notes |
|---|---|---|
| User assets | `video-projects/{projectId}/assets/{assetId}.{ext}` | unchanged today |
| Composition artifact | `video-compositions/{projectId}/{compositionId}/` | spec.json, manifest.json, index.html, sub-compositions, styles.css, assets, vendor/gsap.min.js |
| Preview + final MP4 | `video-versions/{projectId}/{versionId}.mp4` | unchanged today; preview uses the same prefix with a `preview` flag column |
| Customer Design Pack (later) | `design-packs/{tenantId}/{styleId}/{version}/` | built-in pack ships with source, not in Storage |

Network is allowed at **compose/compile** time (CLI registry fetch, LLM calls). It is forbidden at
**render** time (PRD §16): the artifact is self-contained before it is frozen.

### Determinism

A render is reproducible from: Composition Spec + Compiler version + Design Pack id/version +
Module versions + Asset hashes. Forbidden runtime behaviour: `Date.now()`, `Math.random()`, remote
fetch, unseeded variation. Where variation is wanted it derives from a seed frozen in the spec.

`compositionHash = sha256(canonical(spec) + compilerVersion + designPack{id,version} + moduleVersions + assetHashes)`
and is the artifact's identity, stored on the artifact row and copied to `video_versions`.

## Composition Spec (PRD §12)

Zod schema, `schemaVersion: "composition-spec@v1"`:

```
{ schemaVersion, format: { aspectRatio, fps, durationSeconds },
  style: { id: "creative-mode", version },
  scenes: [ { id, durationFrames, transition?, motion?, modules: [ ModuleInstance ] } ] }

ModuleInstance = { id, kind: "internal" | "catalog", version?, content: Record<string, string>, variables?: Record<string, string> }
```

Internal modules render inline inside each scoped scene content grid. Catalog blocks mount through
sub-composition hosts, pinned by item name from `catalog.json`; their source files are vendored into
the artifact at compile time.

New provider output requires `transition` (`cut`, `fade`, `slide`, `zoom`) and `motion`
(`staged_reveal`, `product_push`). Stored specs may omit them; the timeline resolves `slide` and
`staged_reveal`. Transitions describe entry from the previous scene. `product_push` requires a
ProductHero. The compiler emits a `ledger.json` for directional handoffs and seek-safe GSAP.

Scene and catalog-host timestamps serialize the full `frames / fps` value, not a
millisecond-rounded value. Boundary samples also derive from integer frame indices. This
keeps fractional-second beats aligned with the producer's half-open clip intervals.

## Validators (PRD §13)

`schema` (zod) · `catalog` (every catalog id exists in `catalog.json`) · `fact` (every string in
`content` traces to the brief; no invented price/discount/benefit/CTA) · `asset` (asset ids are
owned, present, and hash-verified) · `duration` (sum of `durationFrames` ≤ `durationSeconds×fps`) ·
`compatibility` (each catalog item's dimensions match the target aspect; internal modules declare
supported ratios).

The planner makes one attempt, then uses the deterministic fallback if validation rejects it.
New plans also pass `validateStoryboard`: ordered recipe beats, one focal purpose per beat,
no repeated visible phrases in a scene, and CTA only in the closing beat. Supporting copy may
preserve the confirmed key message without creating a second headline. This planning-only gate
does not reject the structure of existing stored revisions. Fallbacks use the same recipe beats
and semantic validation.

## Visual check (PRD §17)

Compilation writes a scratch artifact, runs the pinned `hyperframes@0.8.59 check`, then samples
geometry with the producer's real seekable runtime. Only a passing artifact can be uploaded.
The CLI gate checks lint, runtime, layout, motion, contrast, and media frame bounds; incomplete,
inconsistent, truncated, or unsampled reports fail closed.

`createCompositionVisualGate` runs capture in a separate Node process using
`composition-visual-worker.ts`. Node with native TypeScript stripping must be on `PATH`.
The worker owns `createFileServer`, `createCaptureSession`, `initializeSession`, and
`captureFrameToBuffer`: the producer's Hono adapter replaces global `Request`/`Response`,
which must never happen in the Bun API process. Each check has a unique temporary directory,
validated JSON results, a five-minute process deadline, and cleanup on success or failure.
Missing or incomplete worker results fail closed. Samples cover readable phases and one frame before, at, and after
each interior boundary. It checks text wrapping/clipping, module and image/text collisions,
every staged word being readable before the beat closes, loaded images/fonts, and nonblank
handoffs. Failed gates remove scratch and perform no artifact upload. Catalog-only mounted
beats can provide the foreground at a boundary.

Internal modules share a content-driven grid with portrait, square, and landscape states.
Sparse product, offer, and CTA beats have distinct focal layouts. Module CSS is scoped to its
scene with `@scope`, so one scene's tone cannot replace another's stylesheet. ProductHero has
no opaque full-frame fill. The offer is the pink marker with the single hard shadow; the green
closing plate reserves cream display type for the CTA and a cream-backed supporting line.

`pnpm --filter backend compose:smoke --ratio 9:16 --resolution 1080p --duration 10 --keep`
runs this same visual gate before rendering. Approved artifacts remain immutable; generator
changes require a new composition, not editing previously uploaded HTML.

## Preview and approval (PRD §18, §19)

- Preview: draft-quality MP4 rendered from the frozen artifact (`video_versions.kind = 'preview'`).
- Export: delivery-quality MP4 from the **same** artifact (`kind = 'final'`).
- UI affords exactly two verbs: **Approve** and **Generate ulang** (a new composition revision).

## Data model

Kept unchanged: `video_projects` (constraints altered), `video_project_assets`, `video_messages`,
`video_brief_revisions`, `video_moderation_events`.

Altered:
- `video_projects`: `video_type in (5 recipes)`; `style_id in ('creative-mode')`; `duration_seconds between 4 and 30`.

Dropped: `video_storyboard_revisions`.

New:
- `video_art_direction_revisions` (append-only): project_id, user_id, version, schema_version,
  art_direction jsonb, generated_by jsonb, source_message_ids, created_at. Unique (project_id, version).
- `video_composition_revisions` (append-only): project_id, user_id, version, schema_version,
  art_direction_revision_id fk, composition_spec jsonb, validation_report jsonb, visual_check jsonb,
  status (`valid`|`fallback`|`invalid`), is_fallback bool, created_at. Unique (project_id, version).
- `video_composition_artifacts`: project_id, user_id, composition_revision_id fk (unique),
  design_pack_id, design_pack_version, compiler_version, module_versions jsonb, asset_hashes jsonb,
  composition_hash (64 hex, unique), artifact_object_key (unique), created_at.
- `video_composition_events` (observability, PRD §21): id, project_id, user_id, composition_revision_id,
  render_job_id, kind, recipe, design_pack, catalog_components text[], fallback_used bool,
  planner_latency_ms, render_duration_ms, render_status, render_error, llm_cost numeric(20,9),
  created_at.

Recreated:
- `video_render_jobs`: same queue semantics (one active job per project), but the snapshot points at
  `composition_artifact_id` instead of brief/storyboard revisions.
- `video_versions`: `manifest_hash` -> `composition_hash`, add `kind ('preview'|'final')`.

Each new table follows the existing migration pattern: `begin;`/`commit;`, `create table public.<name> `,
RLS enabled, `revoke ... from anon, authenticated`, `service_role` grants, and append-only tables get
column-scoped update grants. `video-migrations.test.ts` gains assertions for the new tables and drops
the storyboard assertions.

## HTTP contract (rework of `routes/video.ts`)

Kept: `POST/GET/DELETE /video-projects`, `/messages*`, `/assets*`, `/render-jobs*`, `/versions*`,
`/brief`, `/download`.

Changed / new:

| Method | Path | Purpose |
|---|---|---|
| POST | `/video-projects/:id/compositions` | generate a composition revision (planner -> validate -> compile -> visual check); body `{ idempotencyKey }` |
| GET | `/video-projects/:id/compositions` | list composition revisions |
| GET | `/video-projects/:id/compositions/:compositionId` | spec + art direction + validation + visual check + previewUrl |
| POST | `/video-projects/:id/compositions/:compositionId/approve` | freeze artifact, allow render |
| POST | `/video-projects/:id/compositions/:compositionId/regenerate` | "Generate ulang": new revision from the same brief |

Removed: `GET /storyboard`, `POST /approve` (brief+storyboard approval).

Responses never leak `user_id`, `object_key`, `idempotency_key`, or raw hashes beyond what the UI needs.

## Frontend (`apps/app`)

`/dashboard/videos` list and `/dashboard/videos/new` setup form stay, with the new recipe/duration/
style options. `/dashboard/videos/[projectId]` becomes: chat (interview, kept) -> **composition
preview** (draft MP4) -> **Approve** / **Generate ulang** -> render progress -> versions/download.
`VideoBriefPanel`, `VideoStoryboardPanel` are replaced by a composition panel; `VideoApprovalPanel`
targets the composition. The video-source boundary test (no server-only imports in `features/video`)
still holds.

## Risks

| Risk | Mitigation |
|---|---|
| `hyperframes add` output shape / offline render of catalog blocks | Prove one real catalog block end-to-end in a spike task before wiring the planner |
| CLI 0.8.59 vs catalog data authored by newer registry | Pin CLI version; regenerate catalog with the pinned CLI only |
| Catalog blocks are mostly 1920x1080 while target is 9:16 | Compatibility validator rejects mismatches; fallback covers it |
| 386 catalog items; `add` for all is heavy | Generate details for blocks first; keep generation manual and committed |
| Fonts (Archivo Black etc.) not embedded | @fontsource packages vendored into the artifact, no network at render |
| Dropping storyboard tables is destructive | Single migration; local DB reset; no production data assumed |

## Acceptance (PRD §25)

Brief -> MP4 without manual HTML; catalog discovery + validation; internal module mixed with a
HyperFrames component; design consistency with the pack; no fabricated facts; preview and export
share the artifact; fallback works; reproducible renders; no critical visual defect. The Julumpia
case (discount 20%, 9:16, 12 s, creative-mode) is the demo.
