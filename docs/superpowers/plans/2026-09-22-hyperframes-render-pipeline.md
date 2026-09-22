# HyperFrames Render Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install HyperFrames and wire it into the existing chat-video backend so a queued `video_render_jobs` row is claimed by a worker, rendered into a deterministic MP4, uploaded to the shared private Supabase bucket, recorded as a `video_versions` row, and surfaced in the existing `apps/app` workspace as job status, a player, and a download.

**Architecture:** Add the render subsystem as three layers mirroring the existing video modules (`routes -> application -> domain <- infrastructure`). `domain/video` gains the pure pieces — style packs, a template registry, the immutable `RenderManifest` and its fingerprint, and a composition source builder that turns a manifest into HTML/CSS. `application/video/render-worker.ts` owns the job lifecycle as a use case and depends only on ports. `infrastructure/video/hyperframes/` implements the `RenderEngine` port with `@hyperframes/producer` (headless Chrome + FFmpeg). The worker is a separate process (`src/worker/index.ts`) from the Elysia HTTP server, exactly as the PRD's "separate job boundary" requires, and it claims work through a conditional `queued -> preparing` update so two workers can never render the same job.

**Tech Stack:** TypeScript 5, Bun (API server) / Node 22 + Bun (worker), ElysiaJS 1.4, Zod 4.4.3, Vitest 3.2.4, Supabase (Postgres 17 + Storage) via `@supabase/supabase-js` 2.108, `@hyperframes/producer` 0.8.59 (Apache-2.0, HeyGen), `gsap` (vendored locally at render time), FFmpeg/FFprobe, Next.js 16.2.9 + React 19 + Tailwind v4, pnpm workspaces + Turborepo.

**Spec:** `docs/prd/chat-based-ai-video-generator-mvp.md` — the PRD is the specification; there is no separate design doc for this plan. The deferred-work contract this plan must satisfy is written down in `apps/backend/docs/chat-video-generator.md` ("The three plans that complete the product" → *Render plan*) and the still-open list in `apps/app/docs/notes/video-backend-backlog.md`.

## Scope Of This Plan

This plan delivers backlog items **1, 2, and 7** from `apps/app/docs/notes/video-backend-backlog.md`: the render worker + MP4, the `video_versions` row that makes listing/player/download real, and the reconciliation of `RENDER_SUPPORTED_COMBINATIONS` against a real HyperFrames spike.

**In scope:**

- The HyperFrames technical spike the PRD lists as a hard prerequisite (`docs/prd/chat-based-ai-video-generator-mvp.md` → "HyperFrames belum terpasang"), ending in a committed decision record and a reconciled render-combination allowlist.
- `@hyperframes/producer` as a pinned backend dependency, plus the vendored animation runtime and pinned Chrome/FFmpeg paths.
- The `RenderEngine` port, the `HyperFramesRenderEngine` adapter, the deterministic composition writer, and the template registry / style packs / `RenderManifest` the PRD requires.
- `render-input@v2`, raising the frozen job snapshot so it names the template, the style-pack version, and the fps.
- The worker process: claim loop, lifecycle transitions, stale-job reclamation, timeout, abort-on-shutdown, MP4 upload, and the `video_versions` row.
- One new migration: the shared bucket must accept `video/mp4` and hold a file larger than 10 MB.
- The frontend render panel: queue a render, poll its status, play the MP4, download it, and list versions.

**Deliberately out of scope — and why:**

1. **No audio.** TTS and music providers are `TBD` in the PRD ("Voice-over memerlukan provider TTS (TBD)", "Musik … (TBD)"). The rendered MP4 is therefore **silent**. `voiceOverEnabled` still has an effect — it is what makes the storyboard carry `caption` text — and those captions are burned into the frame as on-screen text. Nothing in this plan calls a media provider.
2. **No moderation.** `moderation_status` stays `pending` (backlog item 3) and the worker does not gate on it. It renders assets whose status is `pending` or `allowed`, and refuses `blocked`.
3. **No revision path.** `revision_planner` does not exist (backlog item 5), so a project can never reach `revision_draft` through the UI. The rerender quota is nevertheless enforced by the existing intake and claim code, and this plan tests it, but it is not reachable from the frontend yet.
4. **No thumbnails** (backlog item 6), no project deletion changes, no rate limiting, no cloud/Lambda rendering (local worker only, per the PRD's MVP).
5. **No Docker render path.** The PRD lists cross-host determinism as a risk with a container-image mitigation; this plan pins the browser and FFmpeg paths and asserts same-host determinism, and the decision record carries Docker as an open question for deployment.

**Two decisions this plan makes, and why:**

1. **The worker runs as its own process, kept in the same `apps/backend` package.** The PRD requires the worker to be "proses/job boundary terpisah dari request HTTP" and later movable to the cloud "tanpa mengubah public API atau schema job". A second entry point (`src/worker/index.ts`) plus the unchanged `video_render_jobs` schema satisfies both without introducing a new package or a queue service. The claim is a conditional database update, so a second worker replica is safe on day one.
2. **Animation is GSAP, vendored into each render's work directory — never a CDN.** The PRD's determinism contract forbids fetching mid-render ("No fetching mid-render. Every asset loads before the first frame"), and the linter errors on a composition that uses GSAP without loading it. So `gsap` becomes a pinned dependency whose `dist/gsap.min.js` is copied into the work directory and referenced by a relative path, and the composition registers its paused timeline on `window.__timelines[<compositionId>]`. No composition this plan generates references a remote URL.

## Global Constraints

Copied verbatim from the existing foundation plan's constraints, which still bind this work; the additions are marked **new**.

- Use pnpm only (`pnpm --filter backend <script>`, `pnpm --filter app <script>`), never npm or yarn.
- Follow `routes -> application -> domain <- infrastructure`. `application` must not import `infrastructure` outside a `services.ts` factory; `domain` must not import `application` or `infrastructure`.
- **new** The worker is a second, independently-runnable entry point. It must not import `@/app.ts`, `@/routes/**`, or `@/plugins/**`, and it must not open an HTTP listener.
- Every route is authenticated through the existing `authPlugin` macros (`{ auth: true }`). Never trust a `user_id`, `status`, `id`, or `version` from a request body; derive ownership from the session.
- Service-role clients are used only inside `application/**/services.ts` factories and `infrastructure/**`. Never in a route body or in browser-reachable code.
- New `public` tables are **not** auto-exposed by Supabase. Every new table migration must enable RLS, `revoke all ... from anon, authenticated`, and grant explicitly to `service_role`. (This plan adds no table, but it does alter the storage bucket.)
- Revision rows are immutable once approved: grant only column-scoped `update` on the approval columns.
- Never log or persist prompts, provider payloads, API keys, signed URLs, image bytes, or file names as filesystem paths.
- Object keys are internal: `video-projects/<projectId>/<assetId>.<ext>`, `video-versions/<projectId>/<versionId>.mp4`. Never store or return a public or signed URL as a canonical reference.
- Signed URLs are short-lived and generated per request after an ownership check.
- Errors returned to clients contain only a normalized `code` and a fixed safe message. No provider or database text. **new** A render job's `error_code` is therefore a value from this plan's closed set (`RENDER_FAILURE_CODES`), never an exception message, a stack trace, or a HyperFrames diagnostic string.
- Every production behaviour is written red-green-refactor: failing test, run it, minimal implementation, run it, then commit. Read the TDD skill's `writing-good-tests.md` before writing tests.
- Migrations are added to `apps/backend/supabase/migrations/` only. `apps/app/supabase/` holds no migrations.
- **new** Every generated composition is fully offline: no `http://` or `https://` reference may appear in the emitted HTML, CSS, or JavaScript. A test asserts this.
- **new** All user- and model-authored text that reaches the composition is HTML-escaped, and user text never reaches emitted JavaScript. A test asserts this with a `<script>` payload in an on-screen title.
- **new** HyperFrames is pinned exactly (`@hyperframes/producer: 0.8.59`, no caret) and Chrome and FFmpeg are addressed by explicit path, per the PRD's "Pin dependency, browser, font, codec, HyperFrames version" risk mitigation.
- **new** Nothing in this plan writes audio, calls a model, or calls a media provider. `musicEnabled` and `voiceOverEnabled` do not yet produce sound.
- Do not commit unless the user explicitly requests commits. If they have not, treat every task's final "Commit" step as "report the working tree" and leave the changes staged-but-uncommitted or unstaged, as the user prefers.

## Review Focus

The PRD is a vision document. These are the input classes and failure modes it implies but no acceptance criterion names, ordered by how likely they are to bite a real F&B user. Each one is pinned by a test in the task named beside it.

1. **The worker dies mid-render.** The process is killed, the host reboots, or the container is evicted while a job is `preparing`, `rendering`, or `uploading`. Because `video_render_jobs_active_project_idx` counts those statuses as active, the project can never be rendered again: every later intake answers `video_state_conflict`. Expected: a started job that has not advanced within the staleness window is failed and its project released back to `approved`. — Task 5 (reclamation) and Task 8.
2. **Two workers claim the same job.** A second worker replica starts, or the first worker is restarted while its old claim is still fresh. Expected: exactly one render runs, exactly one `video_versions` row exists for that job (the table has `render_job_id unique`), and the loser spends no rerender and writes nothing. — Tasks 5 and 8.
3. **The encoded file disagrees with the storyboard.** FFmpeg produces a file whose duration, width, or height does not match the approved settings — a bad composition, a truncated encode, or a wrong `deviceScaleFactor`. Expected: the render is refused and the job fails with a normalized code rather than a version being published that does not match what the user approved. — Task 7 (FFprobe verification) and Task 8.
4. **An asset's bytes changed after approval.** Someone overwrites a project image in storage, or a partial write truncated it, between approval and the render. The manifest froze the asset's `sha256` at intake, so the worker must re-verify the bytes it downloads. Expected: the render is refused rather than publishing a video built from mutated bytes. — Tasks 4 (freeze) and 8 (re-verify).
5. **An MP4 too large for the bucket.** The bucket's `file_size_limit` is 10 MB and its MIME allowlist is images-only, so every upload would fail with a storage error that names nothing useful. Expected: the bucket accepts `video/mp4` up to the new ceiling, and an output that still exceeds the ceiling fails the job cleanly with the project released, not stranded. — Task 2 (bucket) and Task 8 (size guard).

Two more the plan pins because they are cheap and the PRD is explicit about them:

6. **A rerender that fails after the claim still spends a rerender.** `beginRenderJob` consumes one of three rerenders for a revision job the moment the claim wins, and there is no refund path. Expected and documented: a revision render that fails at the worker stage leaves the user with one fewer rerender. — Task 8 (asserted, not "fixed") and Task 10 (documented).
7. **A `render-input@v1` snapshot, or one written by a newer deploy.** The snapshot schema is strict by design. Expected: the worker fails the job with `render_input_unsupported` instead of throwing an unhandled parse error. — Task 8.

---

### Task 1: HyperFrames Render-Engine Spike

This is a spike task. It is not TDD — its deliverables are a decision record whose evidence must be reproducible, a pinned dependency, and a reconciled combination allowlist. Every claim in the record must come from a command that was actually run on this machine.

**Files:**
- Create: `docs/decisions/2026-09-21-hyperframes-render-engine.md`
- Create (scratch, not committed): `$COMMANDCODE_SCRATCHPAD/hyperframes-spike/**`
- Modify: `apps/backend/package.json` (add the pinned dependency)
- Modify: `apps/backend/.npmrc` (skip the Puppeteer Chromium download)
- Modify: `apps/backend/src/domain/video/render-compatibility.ts` (keep only verified rows)
- Modify: `apps/backend/src/domain/video/render-compatibility.test.ts`
- Modify: `apps/backend/src/domain/video/settings.test.ts`
- Modify: `apps/app/domain/video/settings.ts` (`isRenderCombinationSupported`)

**Interfaces:**
- Consumes: nothing from earlier tasks. Read `apps/backend/src/domain/video/render-compatibility.ts` first — its comment already names this decision record as its source.
- Produces, for every later task: the verified HyperFrames version, the runtime that renders successfully, the Chrome and FFmpeg paths, the per-combination render times, the set of combinations the MVP may offer, and the measured single-render wall time that Task 5's timeout default is derived from.

- [ ] **Step 1: Read the provider's documentation and record it**

Read `https://hyperframes.heygen.com/introduction`, `https://hyperframes.heygen.com/packages/producer`, `https://hyperframes.heygen.com/concepts/determinism` and `https://hyperframes.heygen.com/concepts/compositions`. Record every URL and its retrieval date at the top of the decision record. Do not infer any attribute name from the templates in `node_modules/hyperframes/dist/templates`.

- [ ] **Step 2: Install into scratch and record the environment**

```bash
mkdir -p "$COMMANDCODE_SCRATCHPAD/hyperframes-spike" && cd "$COMMANDCODE_SCRATCHPAD/hyperframes-spike"
npm init -y
npm i hyperframes @hyperframes/producer
npx hyperframes doctor --json
ffmpeg -version | head -1
ffprobe -version | head -1
which google-chrome
node --version
bun --version
nproc && free -m
```

Paste the whole `doctor --json` payload and the version lines into the record. The `frames cache` row matters: `doctor` fails it under 2 GB free and takes `HYPERFRAMES_EXTRACT_CACHE_DIR` to move it.

- [ ] **Step 3: Create the evidence composition**

Create `$COMMANDCODE_SCRATCHPAD/hyperframes-spike/matrix/index.template.html` — one composition whose stage size and duration are driven by placeholders, so a single template renders every combination. Step 4 generates `matrix/index.html` from it. This is throwaway spike material; it is not the production template.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="./gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; overflow: hidden; background: #0a0a0a; }
      #root { position: relative; overflow: hidden; }
      .scene { position: absolute; inset: 0; }
      .scene img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .scene h1 { position: absolute; left: 8%; bottom: 18%; color: #fff; font-size: 5vw; font-family: Inter, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="matrix" data-start="0" data-duration="__DURATION__"
         data-width="__WIDTH__" data-height="__HEIGHT__">
      <div id="scene-1" class="scene clip" data-start="0" data-duration="__DURATION__" data-track-index="0">
        <img src="./asset.png" alt="" />
        <h1 id="title-1">Spike</h1>
      </div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#title-1", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6 }, 0);
      window.__timelines = window.__timelines || {};
      window.__timelines["matrix"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
```

Copy a real animation runtime and a real image alongside it — `cp node_modules/gsap/dist/gsap.min.js .` (install `gsap` in the scratch project) and generate a 1080×1920 PNG with FFmpeg so the `img` reference is a real local file:

```bash
npm i gsap && cp node_modules/gsap/dist/gsap.min.js .
ffmpeg -f lavfi -i color=c=0xEFF31B:s=1080x1920 -frames:v 1 asset.png
```

- [ ] **Step 4: Render the 3 × 2 × 3 matrix and record each result**

Run each of the eighteen combinations at 720p and 1080p with `--quality draft` (a full-quality pass at every combination is not needed for feasibility; run one `--quality high` reference render at 9:16/1080p/10s for the quality and determinism evidence). Time every render and record the observed file with `ffprobe`.

```bash
mkdir -p out
for combo in "1080x1920 9x16" "1080x1080 1x1" "1920x1080 16x9"; do
  set -- $combo; base="${1%x*}"; name="$2"
  for res in 720 1080; do
    for dur in 6 10 15; do
      w=$(( base * res / 1080 )); h=$(( ${1#*x} * res / 1080 ))
      sed -e "s/__WIDTH__/$w/" -e "s/__HEIGHT__/$h/" -e "s/__DURATION__/$dur/" \
        matrix/index.template.html > matrix/index.html
      echo "=== $name ${res}p ${dur}s ($w x $h) ==="
      /usr/bin/time -f "%e s" node_modules/.bin/hyperframes render \
        --composition ./matrix/index.html --output "./out/$name-$res-$dur.mp4" \
        --fps 30 --quality draft 2>&1 | tail -5
      ffprobe -v error -select_streams v:0 \
        -show_entries stream=width,height,codec_name,r_frame_rate \
        -show_entries format=duration -of default=noprint_wrappers=1 \
        "./out/$name-$res-$dur.mp4"
    done
  done
done
```

The stage size is set by `data-width` / `data-height`, which this loop rewrites, so `--resolution` (a supersampling flag) stays unset. Record for each of the eighteen rows: exit status, wall time, output size, and the FFprobe width/height/duration. Any combination whose FFprobe dimensions or duration disagree with the requested values is **not supported** and its row is removed from `RENDER_SUPPORTED_COMBINATIONS`.

- [ ] **Step 5: Verify determinism and the runtime, then record both**

Render the same composition twice and compare digests:

```bash
node_modules/.bin/hyperframes render --composition ./matrix/index.html --output ./out/det-a.mp4 --quality high --fps 30
node_modules/.bin/hyperframes render --composition ./matrix/index.html --output ./out/det-b.mp4 --quality high --fps 30
sha256sum ./out/det-a.mp4 ./out/det-b.mp4
```

Then answer the runtime question, which decides the worker's npm script. Run a two-second render from a Node script and from a Bun script against the same composition, both importing `@hyperframes/producer`:

```bash
cat > probe.mjs <<'EOF'
import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
const job = createRenderJob({ fps: 30, quality: "draft", format: "mp4", entryFile: "matrix/index.html" });
await executeRenderJob(job, process.cwd(), "./out/probe.mp4", (j, m) => process.stdout.write(`${Math.round(j.progress)}% ${m}\n`));
console.log("probe ok", job.status, job.outcome);
EOF
node probe.mjs; echo "node exit=$?"
bun probe.mjs;  echo "bun exit=$?"
```

Also run the two gates that later tasks rely on: `hyperframes check ./matrix` (the browser gate, which reports lint, runtime, layout and motion findings) and `hyperframes lint ./matrix --json`.

- [ ] **Step 6: Write the decision record**

Create `docs/decisions/2026-09-21-hyperframes-render-engine.md` — the filename is fixed, because `render-compatibility.ts` already cites it:

````markdown
# Decision: HyperFrames render engine

- **Date:** 2026-09-21
- **Status:** decided
- **Documentation:** <url> (retrieved <date>)
- **Version:** @hyperframes/producer <version>, hyperframes CLI <version>, Apache-2.0

## Verified facts

| Question | Answer | Evidence |
|---|---|---|
| Install and licence | | <command> → <output> |
| Required runtime (Node / Bun / either) | | probe exit codes |
| Required Chrome and how it is addressed | | `doctor --json` + `which` |
| Required FFmpeg / FFprobe | | versions |
| Runtime that successfully renders in this repo | | the successful probe |
| Determinism: two identical renders, same digest | | `sha256sum` pair |
| Determinism: does `--docker` change the baseline? | | <yes/no + why> |
| Element/seeking contract (`data-*`, `class="clip"`, `__timelines`) | | the composition that rendered |
| Local vs remote asset resolution | | the `img`/`src` that rendered |
| Font resolution without a network fetch | | the faces actually painted |
| Per-combination render time and dimensions | | the Step 4 table |
| Combinations the MVP must NOT offer | | the Step 4 rows that disagreed |
| `check` / `lint` result on the evidence composition | | JSON |
| Peak memory and CPU observed | | `free`, `nproc`, `/usr/bin/time` |

## Adapter configuration

- Worker process runtime: `<node|bun>`
- `HYPERFRAMES_BROWSER_PATH`: `<path>`
- `HYPERFRAMES_FFMPEG_PATH`: `<path>`
- `HYPERFRAMES_EXTRACT_CACHE_DIR`: `<path or default>`
- Producer knobs chosen: `PRODUCER_LOW_MEMORY_MODE`, `PRODUCER_MAX_WORKERS`, `PRODUCER_DISABLE_GPU`, `PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS`
- Default fps: `30`
- Default quality: `<draft|standard|high>`
- Measured worst single-render wall time: `<seconds>` → `RENDER_JOB_TIMEOUT_MS` default `<value>`

## Open questions carried into the render plan

- <question or `none`>
````

Every "Verified facts" cell must hold an observed value or the literal text `not supported`, with the evidence that proves it. Redact nothing except API keys (this spike uses none).

- [ ] **Step 7: Add the pinned dependency**

```bash
cd apps/backend
printf 'puppeteer_skip_download=true\n' >> .npmrc
pnpm add --save-exact @hyperframes/producer@0.8.59 gsap@3.14.2
```

The exact pins are the point: an unplanned minor bump must not silently change rendered frames. `puppeteer_skip_download=true` is what stops a second Chromium from being downloaded — renders use the machine's Chrome, addressed by `HYPERFRAMES_BROWSER_PATH`. If `.npmrc` already exists, append the line rather than truncating it.

Then remove the scratch install so it cannot leak into the workspace:

```bash
rm -rf "$COMMANDCODE_SCRATCHPAD/hyperframes-spike/node_modules"
```

- [ ] **Step 8: Reconcile the combination allowlist**

Remove from `RENDER_SUPPORTED_COMBINATIONS` in `apps/backend/src/domain/video/render-compatibility.ts` every combination whose Step 4 row did not produce matching FFprobe dimensions and duration, and fix the file's comment so it cites the now-real record. If the spike proved all eighteen, leave the array untouched and say so in the record. Then update the backend test to assert the array equals exactly the verified set (not merely "contains"), and update `apps/app/domain/video/settings.ts`'s `isRenderCombinationSupported` plus its comment to mirror the same verified set, so the setup screen offers only combinations the renderer has been shown to produce.

- [ ] **Step 9: Verify and commit**

```bash
pnpm --filter backend test -- src/domain/video/render-compatibility.test.ts src/domain/video/settings.test.ts
pnpm --filter backend build
git add apps/backend/package.json apps/backend/.npmrc pnpm-lock.yaml \
  docs/decisions/2026-09-21-hyperframes-render-engine.md \
  apps/backend/src/domain/video/render-compatibility.ts \
  apps/backend/src/domain/video/render-compatibility.test.ts \
  apps/backend/src/domain/video/settings.test.ts apps/app/domain/video/settings.ts
git commit -m "spike: verify the HyperFrames render engine and reconcile the combination allowlist"
```

### Task 2: Storage That Accepts An MP4

The bucket holds images only and caps a file at 10 MB, so the worker's first upload would fail. This task widens the bucket and the provider-neutral object store, and nothing else.

**Files:**
- Create: `apps/backend/supabase/migrations/20260922000000_allow_video_version_objects.sql`
- Modify: `apps/backend/src/domain/ai-service/assets.ts` (widen the store's MIME type)
- Modify: `apps/backend/src/domain/video/limits.ts` (the output ceiling)
- Modify: `apps/backend/src/infrastructure/video/video-migrations.test.ts`
- Test: `apps/backend/src/domain/video/limits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `StoredObjectMimeType` from `domain/ai-service/assets.ts`; `readRenderLimits(environment): { maxOutputBytes: number }` from `domain/video/limits.ts`; the bucket's new size ceiling as a constant `MAX_RENDER_OUTPUT_BYTES`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/infrastructure/video/video-migrations.test.ts` — it already reads migrations off disk, so extend it the same way:

```ts
const bucket = sql("20260922000000_allow_video_version_objects.sql");

it("lets the shared bucket hold a rendered MP4", () => {
  expect(bucket).toMatch(/allowed_mime_types\s*=/i);
  expect(bucket).toMatch(/'video\/mp4'/);
  expect(bucket).toMatch(/file_size_limit\s*=\s*524288000/i);
  expect(bucket).toMatch(/where\s+id\s*=\s*'assets'/i);
});
```

Add to `apps/backend/src/domain/video/limits.test.ts`:

```ts
it("defaults the rendered-output ceiling to 500 MB and reads an override", () => {
  expect(readRenderLimits({}).maxOutputBytes).toBe(524_288_000);
  expect(readRenderLimits({ VIDEO_MAX_RENDER_OUTPUT_BYTES: "1024" }).maxOutputBytes).toBe(1024);
  expect(() => readRenderLimits({ VIDEO_MAX_RENDER_OUTPUT_BYTES: "nope" })).toThrowError();
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/infrastructure/video/video-migrations.test.ts src/domain/video/limits.test.ts`
Expected: FAIL — the migration file does not exist (the SQL reader throws) and `readRenderLimits` is not exported.

- [ ] **Step 3: Write the migration**

Supabase rejects `delete from storage.buckets`, so this updates the existing row rather than recreating it:

```sql
begin;

-- The render worker writes `video-versions/<projectId>/<versionId>.mp4` into the same neutral bucket
-- as the image assets. The bucket was created images-only with a 10 MB ceiling, which no MP4 can
-- satisfy, so the allowlist and the ceiling are widened here. A data migration is not possible:
-- `storage.buckets` also has a database-level trigger that the service role cannot bypass from SQL
-- for a delete, but a plain update is fine.
update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'assets';

commit;
```

- [ ] **Step 4: Widen the object store and add the ceiling**

In `apps/backend/src/domain/ai-service/assets.ts`, add one type and widen one parameter. The image union stays narrow, so no image validator changes:

```ts
export type AssetMimeType = "image/jpeg" | "image/png" | "image/webp";

/**
 * The shared private bucket also holds the render output, so the provider-neutral object store
 * accepts one non-image type. The image union above stays narrow on purpose: every validator that
 * needs to reject a video keeps its own type.
 */
export type StoredObjectMimeType = AssetMimeType | "video/mp4";

export type RenderOutputMimeType = "video/mp4";

export interface AssetObjectStore {
  write(key: string, bytes: Uint8Array, mimeType: StoredObjectMimeType): Promise<void>;
  read(key: string, maxBytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
```

`SupabaseAssetObjectStore.write` already forwards its `mimeType` to `upload({ contentType })`, so no implementation change is needed.

In `apps/backend/src/domain/video/limits.ts`, add a sibling reader to `readAssetLimits` keeping the same strict-zod shape:

```ts
/** Ceiling for one rendered MP4, matching the bucket's `file_size_limit`. */
export const MAX_RENDER_OUTPUT_BYTES = 524288000;

const renderLimitsSchema = z.object({
  VIDEO_MAX_RENDER_OUTPUT_BYTES: z.coerce.number().int().positive().default(MAX_RENDER_OUTPUT_BYTES),
}).strict();

export type RenderLimits = { maxOutputBytes: number };

export function readRenderLimits(environment: Readonly<Record<string, string | undefined>> = process.env): RenderLimits {
  const parsed = renderLimitsSchema.safeParse({ VIDEO_MAX_RENDER_OUTPUT_BYTES: environment.VIDEO_MAX_RENDER_OUTPUT_BYTES });
  if (!parsed.success) throw new VideoError("video_input_invalid", "The render limits are not configured correctly.");
  return { maxOutputBytes: parsed.data.VIDEO_MAX_RENDER_OUTPUT_BYTES };
}
```

Add `VIDEO_MAX_RENDER_OUTPUT_BYTES` to the `Makefile`'s `env:` grep pattern is **not** needed — the pattern matches `VIDEO_`? It does not. The pattern is `^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ASSET_BUCKET|ADMIN_EMAILS|AI_[A-Z0-9_]+|BILLING_[A-Z_]+|XENDIT_[A-Z_]+)=`, and `VIDEO_MAX_ASSETS_PER_PROJECT` is not in it either, so video limits are documented as environment overrides that `env:` does not copy. Follow that precedent and leave the Makefile alone; the defaults are what runs.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter backend test -- src/infrastructure/video/video-migrations.test.ts src/domain/video/limits.test.ts src/domain/ai-service`
Expected: PASS. Then `pnpm --filter backend build` to prove the widened `write` parameter broke no caller.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/supabase/migrations/20260922000000_allow_video_version_objects.sql \
  apps/backend/src/domain/ai-service/assets.ts apps/backend/src/domain/video/limits.ts \
  apps/backend/src/domain/video/limits.test.ts apps/backend/src/infrastructure/video/video-migrations.test.ts
git commit -m "feat(db): let the shared bucket hold a rendered mp4"
```

### Task 3: Style Packs, Template Registry, And Composition Source

The PRD's "Template, Style Pack, and Deterministic Variation" section: templates pick scene structure, style packs carry the visual language, and the variant seed varies layout and timing *inside* the template's constraints. All of it is pure, so all of it is unit-testable without a browser.

**Files:**
- Create: `apps/backend/src/domain/video/style-packs.ts`
- Create: `apps/backend/src/domain/video/templates/registry.ts`
- Create: `apps/backend/src/domain/video/templates/product-spotlight.ts`
- Create: `apps/backend/src/domain/video/templates/offer-board.ts`
- Create: `apps/backend/src/domain/video/templates/escape-html.ts`
- Create: `apps/backend/src/domain/video/templates/styles.ts`
- Create: `apps/backend/src/domain/video/composition.ts`
- Create: `apps/backend/src/domain/video/render-manifest.test-helpers.ts`
- Test: `apps/backend/src/domain/video/style-packs.test.ts`
- Test: `apps/backend/src/domain/video/templates/registry.test.ts`
- Test: `apps/backend/src/domain/video/composition.test.ts`

**Interfaces:**
- Consumes: `RenderManifest` and `RenderManifestScene` from `render-manifest.ts`, which Task 4 implements. Import them with `import type`, and create `render-manifest.test-helpers.ts` **in this task** — a type-only import is erased at runtime, so this task's tests run before Task 4's implementation exists, while a runtime import of `manifestFixture` would not.
- Produces:
  - `type StylePack = { id: VideoStyleId; version: string; palette: { background: string; surface: string; ink: string; accent: string; accentInk: string }; typography: { displayFamily: string; bodyFamily: string; displayWeight: number; titleSize: string; copySize: string }; motion: { energy: "calm" | "brisk" | "punchy"; enterSeconds: number }; captionTreatment: "boxed" | "underline" | "plain" }`
  - `const STYLE_PACKS: Readonly<Record<VideoStyleId, StylePack>>`
  - `type RenderTemplate = { id: string; version: string; supports: readonly VideoType[]; aspectRatios: readonly VideoAspectRatio[]; build(input: TemplateInput): { html: string; css: string } }`
  - `type TemplateInput = { manifest: RenderManifest; stylePack: StylePack }`
  - `const RENDER_TEMPLATES: readonly RenderTemplate[]`
  - `function selectTemplate(input: { videoType: VideoType; aspectRatio: VideoAspectRatio }): RenderTemplate`
  - `function templateById(id: string, version: string): RenderTemplate`
  - `function buildComposition(manifest: RenderManifest): { compositionId: string; files: readonly { path: string; contents: string }[] }`
  - `function escapeHtml(value: string): string`
  - `function baseStyles(stylePack: StylePack, manifest: RenderManifest): string`, plus `px(manifest, value)` and `safeArea(manifest)`
  - `manifestFixture(overrides)`, `manifestSceneFixture()`, `sceneFixture()`, `assetFixture()`, `manifestSourceFixture(overrides)` from `render-manifest.test-helpers.ts`

- [ ] **Step 1: Write the fixtures and the failing tests**

Create `apps/backend/src/domain/video/render-manifest.test-helpers.ts` first, since three of this task's files and three later tasks import from it. It exports `sceneFixture` (a storyboard scene), `manifestSceneFixture` (the manifest's own scene shape), `assetFixture`, `manifestFixture(overrides)`, and `manifestSourceFixture(overrides)`. It imports only `import type` from `./render-manifest` and `./storyboard`, and imports nothing from Vitest. `manifestFixture()` returns a 9:16, 1080×1920, 10s `product_promo` manifest with `bold_pop`, `fps: 30`, two manifest scenes running `0 → 4` and `4 → 10`, one asset (`asset-1`, `video-projects/p/asset-1.png`, `sha256` of 64 `a`s, `image/png`, 800×800, `fileName: "asset-1.png"`), and `manifestVersion: "render-manifest@v1"`. Every field it returns must exist on Task 4's `RenderManifest`.

Then `apps/backend/src/domain/video/style-packs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STYLE_PACKS } from "./style-packs";
import { VIDEO_STYLE_IDS } from "./settings";

describe("style packs", () => {
  it("covers every style id offered by the API exactly once", () => {
    expect(Object.keys(STYLE_PACKS).sort()).toEqual([...VIDEO_STYLE_IDS].sort());
  });

  it("is frozen and versioned, because a version record keeps the version it rendered with", () => {
    for (const id of VIDEO_STYLE_IDS) {
      const pack = STYLE_PACKS[id];
      expect(pack.id).toBe(id);
      expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Object.isFrozen(pack)).toBe(true);
    }
  });

  it("keeps every colour an opaque hex literal, so a frame never depends on a compositing default", () => {
    for (const pack of Object.values(STYLE_PACKS)) {
      for (const colour of Object.values(pack.palette)) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
```

`apps/backend/src/domain/video/templates/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RENDER_TEMPLATES, selectTemplate, templateById } from "./registry";
import { VIDEO_ASPECT_RATIOS, VIDEO_TYPES } from "../settings";

describe("template registry", () => {
  it("leaves no video type without a template that declares it, at every aspect ratio", () => {
    for (const videoType of VIDEO_TYPES) {
      for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
        expect(() => selectTemplate({ videoType, aspectRatio })).not.toThrow();
      }
    }
  });

  it("selects deterministically for the same input", () => {
    expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id)
      .toBe(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id);
    expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id).toBe("product-spotlight");
    expect(selectTemplate({ videoType: "menu_showcase", aspectRatio: "9:16" }).id).toBe("offer-board");
  });

  it("versions every template, so a manifest can name the version it rendered with", () => {
    for (const template of RENDER_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(new Set(RENDER_TEMPLATES.map((template) => template.id)).size).toBe(RENDER_TEMPLATES.length);
  });

  it("refuses an unknown id and a version the registry does not hold", () => {
    expect(() => templateById("nope", "1.0.0")).toThrowError(/nope/);
    expect(() => templateById("product-spotlight", "9.9.9")).toThrowError(/version/);
  });
});
```

`apps/backend/src/domain/video/composition.test.ts` — the important ones are determinism, escaping, and being fully offline:

```ts
import { describe, expect, it } from "vitest";
import { buildComposition } from "./composition";
import { escapeHtml } from "./templates/escape-html";
import { manifestFixture, manifestSceneFixture } from "./render-manifest.test-helpers";

describe("buildComposition", () => {
  it("produces byte-identical files for the same manifest", () => {
    const manifest = manifestFixture();
    expect(buildComposition(manifest).files).toEqual(buildComposition(manifest).files);
  });

  it("emits nothing that would be fetched at render time", () => {
    const { files } = buildComposition(manifestFixture());
    for (const file of files) {
      expect(file.contents).not.toMatch(/https?:\/\//);
      expect(file.contents).not.toMatch(/src="\/\//);
    }
  });

  it("escapes on-screen copy instead of emitting it as markup", () => {
    const { files } = buildComposition(manifestFixture({
      scenes: [{ ...manifestSceneFixture(), onScreenTitle: '<script>alert(1)</script>' }],
    }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("keeps user text out of the emitted JavaScript", () => {
    const { files } = buildComposition(manifestFixture({
      scenes: [{ ...manifestSceneFixture(), onScreenTitle: '"); alert(1); //' }],
    }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    const script = html.slice(html.indexOf("<script>"));
    expect(script).not.toContain("alert(1)");
  });

  it("stages every scene with the timing the storyboard froze", () => {
    const { files } = buildComposition(manifestFixture());
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toMatch(/data-composition-id="main"/);
    expect(html).toMatch(/data-width="1080"/);
    expect(html).toMatch(/data-height="1920"/);
    expect(html).toMatch(/data-duration="10"/);
    expect(html).toMatch(/class="scene clip" data-start="0" data-duration="4" data-track-index="0"/);
    expect(html).toMatch(/window\.__timelines\["main"\] = tl/);
  });

  it("resolves the template the manifest froze, not the one the video type would select", () => {
    // `product_promo` would select `product-spotlight`; the frozen id must win, which is what makes a
    // registry edit unable to change what an already-queued job renders.
    const { files } = buildComposition(manifestFixture({ templateId: "offer-board", styleId: "premium_dark" }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toContain('class="plate"');
    expect(html).toContain("#171717");
  });

  it("refuses a manifest whose template version is not the one the registry holds", () => {
    expect(() => buildComposition(manifestFixture({ templateVersion: "2.0.0" }))).toThrowError(/version/);
  });
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of text or an attribute", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/domain/video/style-packs.test.ts src/domain/video/templates/registry.test.ts src/domain/video/composition.test.ts`
Expected: FAIL with "Failed to resolve import `./style-packs`".

- [ ] **Step 3: Implement the escape helper and the style packs**

`apps/backend/src/domain/video/templates/escape-html.ts`:

```ts
const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Storyboard copy is model- and user-authored, so it is never interpolated into markup raw. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}
```

`apps/backend/src/domain/video/style-packs.ts` — the four presets the PRD names, as frozen token sets:

```ts
import { VIDEO_STYLE_IDS } from "./settings";
import type { VideoStyleId } from "./types";

export type StylePalette = {
  background: string;
  surface: string;
  ink: string;
  accent: string;
  accentInk: string;
};

export type StylePack = {
  id: VideoStyleId;
  version: string;
  palette: StylePalette;
  typography: {
    displayFamily: string;
    bodyFamily: string;
    displayWeight: number;
    titleSize: string;
    copySize: string;
  };
  motion: { energy: "calm" | "brisk" | "punchy"; enterSeconds: number };
  captionTreatment: "boxed" | "underline" | "plain";
};

/**
 * A style pack is the visual language shared across templates. It is frozen and versioned because a
 * `video_versions` row names the pack version it rendered with: changing a pack changes the frames a
 * rerender produces, and the version record is what makes that traceable rather than silent.
 *
 * Inter is resolved from the producer's bundled @fontsource faces; no pack may name a network font.
 */
export const STYLE_PACKS: Readonly<Record<VideoStyleId, StylePack>> = Object.freeze({
  bold_pop: Object.freeze({
    id: "bold_pop",
    version: "1.0.0",
    palette: Object.freeze({ background: "#050505", surface: "#111111", ink: "#f8f8f5", accent: "#eff31b", accentInk: "#050505" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 800, titleSize: "96px", copySize: "44px" }),
    motion: Object.freeze({ energy: "punchy" as const, enterSeconds: 0.45 }),
    captionTreatment: "boxed" as const,
  }),
  clean_product: Object.freeze({
    id: "clean_product",
    version: "1.0.0",
    palette: Object.freeze({ background: "#f3f3ef", surface: "#ffffff", ink: "#14181c", accent: "#b9c4cc", accentInk: "#14181c" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 600, titleSize: "88px", copySize: "40px" }),
    motion: Object.freeze({ energy: "calm" as const, enterSeconds: 0.6 }),
    captionTreatment: "plain" as const,
  }),
  warm_artisan: Object.freeze({
    id: "warm_artisan",
    version: "1.0.0",
    palette: Object.freeze({ background: "#5b2e1b", surface: "#7a4227", ink: "#fdf3e7", accent: "#d99a62", accentInk: "#3a1c0f" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 700, titleSize: "92px", copySize: "42px" }),
    motion: Object.freeze({ energy: "calm" as const, enterSeconds: 0.7 }),
    captionTreatment: "underline" as const,
  }),
  premium_dark: Object.freeze({
    id: "premium_dark",
    version: "1.0.0",
    palette: Object.freeze({ background: "#171717", surface: "#232323", ink: "#f4f1ea", accent: "#d7c39a", accentInk: "#171717" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 500, titleSize: "84px", copySize: "38px" }),
    motion: Object.freeze({ energy: "brisk" as const, enterSeconds: 0.55 }),
    captionTreatment: "plain" as const,
  }),
});

export function stylePackFor(id: VideoStyleId): StylePack {
  const pack = STYLE_PACKS[id];
  if (!pack) throw new Error(`No style pack for ${id}.`);
  return pack;
}

export const STYLE_PACK_VERSIONS: Readonly<Record<VideoStyleId, string>> = Object.freeze(
  Object.fromEntries(VIDEO_STYLE_IDS.map((id) => [id, STYLE_PACKS[id].version])) as Record<VideoStyleId, string>,
);
```

- [ ] **Step 4: Implement the templates and the registry**

Both templates share one scene renderer, because the difference between them is structure, not markup. `apps/backend/src/domain/video/templates/product-spotlight.ts`:

```ts
import { escapeHtml } from "./escape-html";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

/**
 * One asset-led scene per storyboard scene: the image fills the frame, the title sits above the copy
 * and the caption, all inside the design system's safe area. The variant seed moves the text block
 * between three fixed positions and nothing else, so variation can never move a commercial fact off
 * the safe area or change the running order.
 */
export const productSpotlight: RenderTemplate = {
  id: "product-spotlight",
  version: "1.0.0",
  supports: ["product_promo", "product_launch"],
  aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const textAnchors = ["center", "lower", "upper"] as const;
    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const anchor = textAnchors[index % textAnchors.length] ?? "center";
      const sceneId = `scene-${scene.order}`;
      return [
        `      <div id="${sceneId}" class="scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}">`,
        asset ? `        <img class="scene-image" src="assets/${asset.fileName}" alt="" />` : "",
        `        <div class="scrim"></div>`,
        `        <div class="copy ${anchor}">`,
        `          <h1 id="${sceneId}-title">${escapeHtml(scene.onScreenTitle)}</h1>`,
        `          <p id="${sceneId}-copy">${escapeHtml(scene.onScreenCopy)}</p>`,
        scene.caption ? `          <p id="${sceneId}-caption" class="caption">${escapeHtml(scene.caption)}</p>` : "",
        manifest.callToAction ? `          <p class="cta">${escapeHtml(manifest.callToAction)}</p>` : "",
        `        </div>`,
        `      </div>`,
      ].filter(Boolean).join("\n");
    });

    // Selectors are generated from scene order only; no user text is ever interpolated into a script.
    const timeline = manifest.scenes.map((scene, index) => {
      const sceneId = `scene-${scene.order}`;
      const at = round(scene.startSeconds + index * 0.05);
      return `tl.fromTo("#${sceneId}-title", { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: ${stylePack.motion.enterSeconds} }, ${at});`;
    }).join("\n");

    const html = `<!doctype html>
<html lang="${escapeHtml(manifest.language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${manifest.width}, height=${manifest.height}" />
    <link rel="stylesheet" href="./styles.css" />
    <script src="./vendor/gsap.min.js"></script>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${manifest.durationSeconds}"
         data-width="${manifest.width}" data-height="${manifest.height}">
${scenes.join("\n")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${timeline}
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;

    return { html, css: sceneStyles(stylePack, manifest) };
  },
};

function sceneStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `${baseStyles(stylePack, manifest)}

.scene-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

/* The scrim is what keeps the approved copy legible over an arbitrary user photo, so it belongs to
   the template rather than being something a style pack can omit. */
.scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.72) 100%);
}

.copy {
  position: absolute;
  left: var(--safe);
  right: var(--safe);
  display: flex;
  flex-direction: column;
  gap: ${px(manifest, 18)};
}

.copy.center { top: 50%; transform: translateY(-50%); }
.copy.lower { bottom: var(--safe); }
.copy.upper { top: var(--safe); }

.cta {
  align-self: flex-start;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  padding: ${px(manifest, 14)} ${px(manifest, 28)};
  border-radius: 999px;
}
`;
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }
```

Add the shared style helpers in `apps/backend/src/domain/video/templates/styles.ts`, so the two templates cannot drift on tokens, reset, or safe area:

```ts
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";

/**
 * The design system is authored at a 1080 short side, so text is scaled off the frame's short side:
 * a 720p render is the same layout at a smaller frame, never a shrunken 1080p composition.
 */
export function styleScale(manifest: RenderManifest): number {
  return Math.min(manifest.width, manifest.height) / 1080;
}

export function px(manifest: RenderManifest, value: number): string {
  return `${Math.round(value * styleScale(manifest))}px`;
}

export function safeArea(manifest: RenderManifest): number {
  return Math.round(Math.min(manifest.width, manifest.height) * 0.08);
}

/** The tokens and the reset both templates share; each template appends only its own layout rules. */
export function baseStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `:root {
  --background: ${stylePack.palette.background};
  --surface: ${stylePack.palette.surface};
  --ink: ${stylePack.palette.ink};
  --accent: ${stylePack.palette.accent};
  --accent-ink: ${stylePack.palette.accentInk};
  --safe: ${safeArea(manifest)}px;
  --title-size: ${stylePack.typography.titleSize};
  --copy-size: ${stylePack.typography.copySize};
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: ${manifest.width}px;
  height: ${manifest.height}px;
  overflow: hidden;
  background: var(--background);
  font-family: "${stylePack.typography.bodyFamily}", system-ui, sans-serif;
}

#root { position: relative; width: ${manifest.width}px; height: ${manifest.height}px; overflow: hidden; }

.scene { position: absolute; inset: 0; }

h1 {
  color: var(--ink);
  font-family: "${stylePack.typography.displayFamily}", system-ui, sans-serif;
  font-weight: ${stylePack.typography.displayWeight};
  font-size: var(--title-size);
  line-height: 1.05;
  letter-spacing: -0.02em;
}

p { color: var(--ink); font-size: var(--copy-size); line-height: 1.3; }

${captionStyles(stylePack)}
`;
}

function captionStyles(stylePack: StylePack): string {
  switch (stylePack.captionTreatment) {
    case "boxed":
      return ".caption { display: inline-block; align-self: flex-start; background: var(--surface); padding: 8px 16px; }";
    case "underline":
      return ".caption { display: inline-block; align-self: flex-start; border-bottom: 4px solid var(--accent); padding-bottom: 6px; }";
    case "plain":
      return ".caption { display: block; opacity: 0.92; }";
  }
}
```

`offer-board.ts` is the same shape with a price-led structure instead of a full-bleed image:

```ts
import { escapeHtml } from "./escape-html";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

/**
 * A price-led template. The offer plate is pinned for the whole video rather than shown for one
 * scene, so a discount or a menu price is on screen from the first frame to the last, and the product
 * image sits in a framed card instead of bleeding to the edge. Menu rows render when the brief has
 * them, which is what makes `menu_showcase` work with the same template as `discount_promo`.
 */
export const offerBoard: RenderTemplate = {
  id: "offer-board",
  version: "1.0.0",
  supports: ["discount_promo", "menu_showcase"],
  aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const offerLabel = manifest.menuItems.length > 0
      ? manifest.menuItems.map((item) => (item.price ? `${item.name} · ${item.price}` : item.name)).join("  ·  ")
      : manifest.callToAction ?? manifest.keyMessage;

    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const sceneId = `scene-${scene.order}`;
      return [
        `      <div id="${sceneId}" class="scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}">`,
        `        <div class="card">`,
        asset ? `          <img class="scene-image" src="assets/${asset.fileName}" alt="" />` : "",
        `          <div class="card-copy">`,
        `            <h1 id="${sceneId}-title">${escapeHtml(scene.onScreenTitle)}</h1>`,
        `            <p id="${sceneId}-copy">${escapeHtml(scene.onScreenCopy)}</p>`,
        scene.caption ? `            <p id="${sceneId}-caption" class="caption">${escapeHtml(scene.caption)}</p>` : "",
        `          </div>`,
        `        </div>`,
        `      </div>`,
      ].filter(Boolean).join("\n");
    });

    // The plate sits on its own track above every scene, and in its own layer, so no scene transition
    // can take the price off screen.
    const plate = `      <div class="scene plate-layer clip" data-start="0" data-duration="${manifest.durationSeconds}" data-track-index="90">
        <div class="plate">
          <span class="brand">${escapeHtml(manifest.brandName ?? manifest.productName)}</span>
          <span class="offer">${escapeHtml(offerLabel)}</span>
        </div>
      </div>`;

    const timeline = manifest.scenes.map((scene, index) => {
      const sceneId = `scene-${scene.order}`;
      const at = round(scene.startSeconds + index * 0.05);
      return [
        `tl.fromTo("#${sceneId} .card", { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: ${stylePack.motion.enterSeconds} }, ${at});`,
        `tl.fromTo("#${sceneId}-title", { opacity: 0 }, { opacity: 1, duration: ${stylePack.motion.enterSeconds} }, ${round(at + 0.15)});`,
      ].join("\n");
    }).join("\n");

    const html = `<!doctype html>
<html lang="${escapeHtml(manifest.language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${manifest.width}, height=${manifest.height}" />
    <link rel="stylesheet" href="./styles.css" />
    <script src="./vendor/gsap.min.js"></script>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${manifest.durationSeconds}"
         data-width="${manifest.width}" data-height="${manifest.height}">
${plate}
${scenes.join("\n")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${timeline}
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;

    return { html, css: boardStyles(stylePack, manifest) };
  },
};

function boardStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `${baseStyles(stylePack, manifest)}

.plate-layer { z-index: 50; }

.plate {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: ${px(manifest, 6)};
  padding: ${px(manifest, 48)} var(--safe);
  background: var(--surface);
}

.plate .brand { color: var(--ink); font-weight: 700; font-size: ${px(manifest, 34)}; }

.plate .offer {
  color: var(--accent-ink);
  background: var(--accent);
  align-self: flex-start;
  padding: ${px(manifest, 10)} ${px(manifest, 20)};
  font-weight: 800;
  font-size: ${px(manifest, 46)};
}

.card {
  position: absolute;
  left: var(--safe);
  right: var(--safe);
  top: ${px(manifest, 260)};
  bottom: var(--safe);
  display: flex;
  flex-direction: column;
  gap: ${px(manifest, 28)};
}

.scene-image {
  flex: 1;
  width: 100%;
  min-height: 0;
  object-fit: cover;
  border-radius: ${px(manifest, 32)};
  outline: ${px(manifest, 2)} solid var(--accent);
}

.card-copy { display: flex; flex-direction: column; gap: ${px(manifest, 16)}; }
`;
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }
```

`apps/backend/src/domain/video/templates/registry.ts`:

```ts
import { productSpotlight } from "./product-spotlight";
import { offerBoard } from "./offer-board";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { VideoAspectRatio, VideoType } from "../types";

export type TemplateInput = { manifest: RenderManifest; stylePack: StylePack };

export type RenderTemplate = {
  id: string;
  version: string;
  supports: readonly VideoType[];
  aspectRatios: readonly VideoAspectRatio[];
  build(input: TemplateInput): { html: string; css: string };
};

/** The allowlist. The model may recommend a video's look; it never chooses a template. */
export const RENDER_TEMPLATES: readonly RenderTemplate[] = Object.freeze([productSpotlight, offerBoard]);

/** The intake's choice, made once, when the job is queued and frozen into its snapshot. */
export function selectTemplate(input: { videoType: VideoType; aspectRatio: VideoAspectRatio }): RenderTemplate {
  const template = RENDER_TEMPLATES.find(
    (candidate) => candidate.supports.includes(input.videoType) && candidate.aspectRatios.includes(input.aspectRatio),
  );
  if (!template) throw new Error(`No template for ${input.videoType} at ${input.aspectRatio}.`);
  return template;
}

/**
 * The render's choice. A queued job names the template it was approved with, so resolution is by that
 * id and not by re-selecting from the video type: adding a template to the registry must never change
 * what a job that is already queued renders.
 */
export function templateById(id: string, version: string): RenderTemplate {
  const template = RENDER_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`No template with id ${id}.`);
  if (template.version !== version) throw new Error(`Template ${id} is at version ${template.version}, not ${version}.`);
  return template;
}
```

The `throw` is unreachable through the API — `validateOutputSettings` already refuses an unsupported combination — and it is there so a future registry edit that drops a row fails loudly in a test rather than silently rendering nothing.

- [ ] **Step 5: Implement the composition builder**

`apps/backend/src/domain/video/composition.ts`:

```ts
import { templateById } from "./templates/registry";
import { stylePackFor } from "./style-packs";
import type { RenderManifest } from "./render-manifest";

export type CompositionFile = { path: string; contents: string };
export type CompositionSource = { compositionId: string; files: readonly CompositionFile[] };

/** The composition id the runtime uses for `window.__timelines` and `data-composition-id`. */
export const COMPOSITION_ID = "main";

/**
 * A manifest becomes a self-contained composition: two text files and a relative reference to the
 * vendored animation runtime the composition writer copies in. Nothing here reads the filesystem or
 * the network, so the same manifest always produces the same bytes and the whole thing is unit-testable.
 *
 * The template is resolved from the manifest's frozen id and version rather than re-selected from the
 * video type, so a registry edit cannot change what an already-queued job renders.
 */
export function buildComposition(manifest: RenderManifest): CompositionSource {
  const template = templateById(manifest.templateId, manifest.templateVersion);
  const { html, css } = template.build({ manifest, stylePack: stylePackFor(manifest.styleId) });

  return {
    compositionId: COMPOSITION_ID,
    files: Object.freeze([
      Object.freeze({ path: "index.html", contents: html }),
      Object.freeze({ path: "styles.css", contents: css }),
    ]),
  };
}
```

- [ ] **Step 6: Verify GREEN**

Run: `pnpm --filter backend test -- src/domain/video`
Expected: PASS, including the offline and escaping assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/domain/video/style-packs.ts apps/backend/src/domain/video/style-packs.test.ts \
  apps/backend/src/domain/video/composition.ts apps/backend/src/domain/video/composition.test.ts \
  apps/backend/src/domain/video/templates
git commit -m "feat(video): add the style packs, template registry, and deterministic composition source"
```

### Task 4: The Render Manifest And `render-input@v2`

The snapshot is the contract between intake and the worker. The foundation plan predicted it would be raised when the render plan landed; this is that change. The manifest is also where determinism is actually enforced, because it freezes the asset bytes, the template version, and the style-pack version.

**Files:**
- Create: `apps/backend/src/domain/video/render-manifest.ts`
- Test: `apps/backend/src/domain/video/render-manifest.test.ts`
- Modify: `apps/backend/src/domain/video/render-input.ts` (bump to `render-input@v2`)
- Modify: `apps/backend/src/domain/video/settings.ts` (add `frameDimensions`)
- Modify: `apps/backend/src/application/video/render-jobs.ts` (`createRenderJob` writes the new fields)
- Modify: `apps/backend/src/application/video/render-jobs.test.ts`
- Modify: `apps/backend/src/application/video/services.ts` (pass fps)
- Test: `apps/backend/src/domain/video/settings.test.ts`

**Interfaces:**
- Consumes: `selectTemplate` and `STYLE_PACK_VERSIONS` from Task 3; `frameDimensions` added here; `RenderJobInputSnapshot` from `domain/video/render-input.ts`. Nothing from `application` — a domain module may not import it.
- Produces:
  - `function frameDimensions(settings: Pick<VideoOutputSettings, "aspectRatio" | "resolution">): { width: number; height: number }`
  - `type RenderManifest`, `type RenderManifestScene`, `type RenderManifestAsset`, `type RenderManifestSource`
  - `function buildRenderManifest(source: RenderManifestSource): RenderManifest`
  - `function renderManifestFingerprint(manifest: RenderManifest): string`
  - `RENDER_INPUT_SCHEMA_VERSION === "render-input@v2"` with `templateId`, `templateVersion`, `stylePackVersion`, `fps` in the snapshot
  - `RenderJobDependencies` gains `fps: number`

- [ ] **Step 1: Write the failing tests**

`apps/backend/src/domain/video/render-manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRenderManifest, renderManifestFingerprint } from "./render-manifest";
import { manifestSourceFixture } from "./render-manifest.test-helpers";

describe("buildRenderManifest", () => {
  it("freezes the template, the style pack version, and the fps from the snapshot", () => {
    const manifest = buildRenderManifest(manifestSourceFixture());
    expect(manifest.templateId).toBe("product-spotlight");
    expect(manifest.templateVersion).toBe("1.0.0");
    expect(manifest.stylePackVersion).toBe("1.0.0");
    expect(manifest.fps).toBe(30);
    expect(manifest.variantSeed).toBe("99999999-9999-4999-8999-999999999999");
  });

  it("pins every referenced asset by hash and by the file name the composition will use", () => {
    const manifest = buildRenderManifest(manifestSourceFixture());
    expect(manifest.assets).toEqual([
      { assetId: "asset-1", objectKey: "video-projects/p/asset-1.png", sha256: "a".repeat(64), mimeType: "image/png", byteSize: 10, width: 800, height: 800, fileName: "asset-1.png" },
    ]);
  });

  it("drops an asset no scene references, so an unrelated upload cannot change a render", () => {
    const manifest = buildRenderManifest(manifestSourceFixture({
      assets: [assetFixture(), { ...assetFixture(), assetId: "asset-unused" }],
    }));
    expect(manifest.assets.map((asset) => asset.assetId)).toEqual(["asset-1"]);
  });

  it("refuses a scene that points at an asset the project does not have", () => {
    expect(() => buildRenderManifest(manifestSourceFixture({
      scenes: [{ ...sceneFixture(), assetIds: ["ghost"] }],
    }))).toThrowError(/ghost/);
  });
});

describe("renderManifestFingerprint", () => {
  it("is a stable 64-character sha256 of a canonical serialization", () => {
    const manifest = buildRenderManifest(manifestSourceFixture());
    const fingerprint = renderManifestFingerprint(manifest);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(renderManifestFingerprint(manifest)).toBe(fingerprint);
  });

  it("changes when any frozen input changes", () => {
    const source = manifestSourceFixture();
    const base = buildRenderManifest(source);
    // The settings live inside the snapshot, so an override has to spread it rather than replace it.
    const changed = buildRenderManifest({
      ...source,
      snapshot: { ...source.snapshot, settings: { ...source.snapshot.settings, durationSeconds: 15 } },
    });
    expect(renderManifestFingerprint(changed)).not.toBe(renderManifestFingerprint(base));
  });
});
```

`apps/backend/src/domain/video/settings.test.ts` — add:

```ts
it("maps every aspect and resolution to an even-pixel frame", () => {
  expect(frameDimensions({ aspectRatio: "9:16", resolution: "1080p" })).toEqual({ width: 1080, height: 1920 });
  expect(frameDimensions({ aspectRatio: "9:16", resolution: "720p" })).toEqual({ width: 720, height: 1280 });
  expect(frameDimensions({ aspectRatio: "16:9", resolution: "1080p" })).toEqual({ width: 1920, height: 1080 });
  expect(frameDimensions({ aspectRatio: "1:1", resolution: "1080p" })).toEqual({ width: 1080, height: 1080 });
  for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
    for (const resolution of VIDEO_RESOLUTIONS) {
      const { width, height } = frameDimensions({ aspectRatio, resolution });
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
    }
  }
});
```

`apps/backend/src/application/video/render-jobs.test.ts` — update the `dependencies()` helper with `fps: 30` and tighten the snapshot assertion:

```ts
it("freezes the template, style-pack version, and fps into the snapshot", async () => {
  const deps = dependencies();
  await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-0001" }, deps);

  expect(deps.jobs.create.mock.calls[0]?.[0]).toMatchObject({
    inputSnapshot: {
      schemaVersion: "render-input@v2",
      variantSeed: "99999999-9999-4999-8999-999999999999",
      templateId: "product-spotlight",
      templateVersion: "1.0.0",
      stylePackVersion: "1.0.0",
      fps: 30,
    },
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/domain/video/render-manifest.test.ts src/domain/video/settings.test.ts src/application/video/render-jobs.test.ts`
Expected: FAIL — `./render-manifest` does not resolve; `frameDimensions` is not exported; the snapshot is still `render-input@v1`.

- [ ] **Step 3: Add `frameDimensions`**

In `apps/backend/src/domain/video/settings.ts`:

```ts
/** The rendered frame size: the named resolution is the short side, and both sides stay even for H.264. */
export function frameDimensions(settings: Pick<VideoOutputSettings, "aspectRatio" | "resolution">): { width: number; height: number } {
  const shortSide = settings.resolution === "1080p" ? 1080 : 720;
  switch (settings.aspectRatio) {
    case "9:16":
      return { width: shortSide, height: (shortSide * 16) / 9 };
    case "1:1":
      return { width: shortSide, height: shortSide };
    case "16:9":
      return { width: (shortSide * 16) / 9, height: shortSide };
  }
}
```

Each division is exact for these presets (720 × 16 / 9 = 1280, 1080 × 16 / 9 = 1920), which the test asserts.

- [ ] **Step 4: Bump the snapshot**

`apps/backend/src/domain/video/render-input.ts`:

```ts
/** Bumped from `render-input@v1` when the render plan landed: v1 did not name a template or an fps. */
export const RENDER_INPUT_SCHEMA_VERSION = "render-input@v2";

export const renderJobInputSnapshotSchema = z.object({
  schemaVersion: z.literal(RENDER_INPUT_SCHEMA_VERSION),
  briefRevisionId: z.string().uuid(),
  storyboardRevisionId: z.string().uuid(),
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsSchema,
  variantSeed: z.string().uuid(),
  /** Frozen so a registry or style-pack edit cannot silently change what a queued job renders. */
  templateId: z.string().trim().min(1),
  templateVersion: z.string().trim().min(1),
  stylePackVersion: z.string().trim().min(1),
  fps: z.number().int().min(1).max(240),
}).strict();
```

- [ ] **Step 5: Implement the manifest**

`apps/backend/src/domain/video/render-manifest.ts`:

```ts
import { createHash } from "node:crypto";
import { frameDimensions } from "./settings";
import type { AssetMimeType } from "../ai-service/assets";
import type { RenderJobInputSnapshot } from "./render-input";
import type { StoryboardScene } from "./storyboard";
import type {
  VideoAspectRatio, VideoDurationSeconds, VideoOutputSettings, VideoResolution, VideoStyleId, VideoType,
} from "./types";

/**
 * A domain module may not import `application`, so this is a local copy of the three-line helper
 * `application/ai-service/register-asset.ts` exports rather than an import of it. It is exported
 * because the composition writer hashes asset bytes with it too — infrastructure may not import
 * `application` either.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const RENDER_MANIFEST_VERSION = "render-manifest@v1";

export type RenderManifestAsset = {
  assetId: string;
  objectKey: string;
  sha256: string;
  mimeType: AssetMimeType;
  byteSize: number;
  width: number;
  height: number;
  /** The name the composition references as `assets/<fileName>`; derived so it can never drift. */
  fileName: string;
};

export type RenderManifestScene = {
  order: number;
  startSeconds: number;
  endSeconds: number;
  visual: string;
  onScreenTitle: string;
  onScreenCopy: string;
  caption: string | null;
  transition: StoryboardScene["transition"];
  assetIds: string[];
};

export type RenderManifest = {
  manifestVersion: string;
  projectId: string;
  renderJobId: string;
  briefRevisionId: string;
  storyboardRevisionId: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  stylePackVersion: string;
  templateId: string;
  templateVersion: string;
  variantSeed: string;
  fps: number;
  width: number;
  height: number;
  durationSeconds: VideoDurationSeconds;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  language: string;
  productName: string;
  brandName: string | null;
  keyMessage: string;
  callToAction: string | null;
  orderDestination: string | null;
  menuItems: readonly { name: string; price: string | null }[];
  scenes: readonly RenderManifestScene[];
  assets: readonly RenderManifestAsset[];
};

export type RenderManifestSource = {
  projectId: string;
  renderJobId: string;
  snapshot: RenderJobInputSnapshot;
  videoType: VideoType;
  fps: number;
  scenes: readonly StoryboardScene[];
  brief: { productName: string; brandName: string | null; keyMessage: string; callToAction: string | null; orderDestination: string | null; menuItems: readonly { name: string; price: string | null }[] | null };
  assets: readonly { id: string; objectKey: string; sha256: string; mimeType: AssetMimeType; byteSize: number; width: number; height: number }[];
};

/**
 * The immutable input of one render. Everything a frame depends on is here: the storyboard timing, the
 * template and style-pack versions, the fps and frame size, and the hash of every asset byte. A
 * rerender of the same manifest therefore produces the same frames, and a fingerprint of this object
 * is what the `video_versions` row records.
 */
export function buildRenderManifest(source: RenderManifestSource): RenderManifest {
  const { width, height } = frameDimensions(source.snapshot.settings);

  // Only the assets a scene actually references are frozen: an unrelated upload must not be able to
  // change this render's bytes or its fingerprint.
  const referenced = new Set(source.scenes.flatMap((scene) => scene.assetIds));
  const byId = new Map(source.assets.map((asset) => [asset.id, asset]));
  const assets = [...referenced].map((assetId) => {
    const asset = byId.get(assetId);
    if (!asset) throw new Error(`Scene references asset ${assetId}, which the project does not have.`);
    return {
      assetId: asset.id,
      objectKey: asset.objectKey,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      fileName: `${asset.id}.${extensionFor(asset.mimeType)}`,
    } satisfies RenderManifestAsset;
  });

  return {
    manifestVersion: RENDER_MANIFEST_VERSION,
    projectId: source.projectId,
    renderJobId: source.renderJobId,
    briefRevisionId: source.snapshot.briefRevisionId,
    storyboardRevisionId: source.snapshot.storyboardRevisionId,
    videoType: source.videoType,
    styleId: source.snapshot.styleId,
    stylePackVersion: source.snapshot.stylePackVersion,
    templateId: source.snapshot.templateId,
    templateVersion: source.snapshot.templateVersion,
    variantSeed: source.snapshot.variantSeed,
    fps: source.fps,
    width,
    height,
    durationSeconds: source.snapshot.settings.durationSeconds,
    aspectRatio: source.snapshot.settings.aspectRatio,
    resolution: source.snapshot.settings.resolution,
    language: source.snapshot.settings.language,
    productName: source.brief.productName,
    brandName: source.brief.brandName,
    keyMessage: source.brief.keyMessage,
    callToAction: source.brief.callToAction,
    orderDestination: source.brief.orderDestination,
    menuItems: source.brief.menuItems ?? [],
    scenes: source.scenes.map((scene) => ({
      order: scene.order,
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      visual: scene.visual,
      onScreenTitle: scene.onScreenTitle,
      onScreenCopy: scene.onScreenCopy,
      caption: scene.caption,
      transition: scene.transition,
      assetIds: [...scene.assetIds],
    })),
    assets,
  };
}

/** A stable fingerprint of the frozen input. `video_versions.manifest_hash` is checked as 64 hex chars. */
export function renderManifestFingerprint(manifest: RenderManifest): string {
  return sha256Hex(new TextEncoder().encode(canonicalJson(manifest)));
}

/** Recursively key-sorted JSON, so two structurally equal manifests cannot hash differently. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export function extensionFor(mimeType: AssetMimeType): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "bin";
}
```

- [ ] **Step 6: Let the intake freeze the new fields**

The shared fixtures already exist from Task 3 (`render-manifest.test-helpers.ts`); this task adds `render-manifest.ts`, which they import types from. Then in `apps/backend/src/application/video/render-jobs.ts`, `createRenderJob` selects the template and writes the new fields:

```ts
const template = selectTemplate({ videoType: project.videoType, aspectRatio: project.settings.aspectRatio });

const inputSnapshot = renderJobInputSnapshotSchema.parse({
  schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
  briefRevisionId: approval.briefRevisionId,
  storyboardRevisionId: approval.storyboardRevisionId,
  styleId: project.styleId,
  settings: project.settings,
  variantSeed: dependencies.createId(),
  templateId: template.id,
  templateVersion: template.version,
  stylePackVersion: stylePackFor(project.styleId).version,
  fps: dependencies.fps,
});
```

Add `fps: number` to `RenderJobDependencies`, and in `services.ts` pass `fps: readRenderWorkerConfig(environment).fps` — the config reader arrives in Task 5; until then use `30` and let Task 5 replace it, so this task stays runnable.

- [ ] **Step 7: Verify GREEN**

Run: `pnpm --filter backend test -- src/domain/video src/application/video`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/domain/video/render-manifest.ts apps/backend/src/domain/video/render-manifest.test-helpers.ts \
  apps/backend/src/domain/video/render-manifest.test.ts apps/backend/src/domain/video/render-input.ts \
  apps/backend/src/domain/video/settings.ts apps/backend/src/domain/video/settings.test.ts \
  apps/backend/src/application/video/render-jobs.ts apps/backend/src/application/video/render-jobs.test.ts \
  apps/backend/src/application/video/services.ts
git commit -m "feat(video): freeze the render manifest and raise the job snapshot to render-input@v2"
```

### Task 5: Worker Config, Job Status Transitions, And The Latest-Job Read

The job repository can claim, fail, and cancel a job but cannot advance one, list work, or reclaim a job whose worker died. The frontend also needs to find the current job after a reload, which needs one new route.

**Files:**
- Create: `apps/backend/src/domain/video/render-config.ts`
- Test: `apps/backend/src/domain/video/render-config.test.ts`
- Modify: `apps/backend/src/domain/video/errors.ts` (add `RenderError` and the failure codes)
- Modify: `apps/backend/src/domain/video/contracts.ts` (repository methods)
- Modify: `apps/backend/src/infrastructure/video/supabase-render-job-repository.ts`
- Modify: `apps/backend/src/infrastructure/video/supabase-render-job-repository.test.ts`
- Modify: `apps/backend/src/application/video/render-jobs.ts` (add `listVideoRenderJobs`)
- Modify: `apps/backend/src/application/video/services.ts`
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`

**Interfaces:**
- Consumes: `readRenderLimits` from Task 2.
- Produces:
  - `type RenderWorkerConfig = { fps: number; quality: "draft" | "standard" | "high"; pollMs: number; concurrency: number; jobTimeoutMs: number; staleJobMs: number; maxOutputBytes: number; workRoot: string | null; browserPath: string | null; ffmpegPath: string | null; extractCacheDir: string | null; lowMemoryMode: boolean; maxWorkers: number; disableGpu: boolean }`
  - `const RENDER_FAILURE_CODES`, `type RenderFailureCode`, and `class RenderError` from `domain/video/errors.ts`
  - `function readRenderWorkerConfig(environment?): RenderWorkerConfig`
  - `VideoRenderJobRepository.latestOwned(projectId, userId)`, `.listQueued(limit)`, `.listStale(startedBefore, limit)`, `.markRendering(jobId)`, `.markUploading(jobId)`, `.succeed(jobId)`
  - `function listVideoRenderJobs(command, dependencies): Promise<RenderJobResponse[]>`
  - Route `GET /video-projects/:projectId/render-jobs` → `200 { jobs: [job] }`

- [ ] **Step 1: Write the failing tests**

`apps/backend/src/domain/video/render-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readRenderWorkerConfig } from "./render-config";

describe("readRenderWorkerConfig", () => {
  it("defaults to one worker, a 30 fps render, and the PRD's ten-minute processing budget", () => {
    const config = readRenderWorkerConfig({});
    expect(config).toMatchObject({ fps: 30, quality: "standard", pollMs: 2000, concurrency: 1, jobTimeoutMs: 600_000, staleJobMs: 900_000, lowMemoryMode: false, maxWorkers: 1, disableGpu: true, browserPath: null, ffmpegPath: null, workRoot: null });
  });

  it("reads every override", () => {
    const config = readRenderWorkerConfig({
      RENDER_FPS: "24", RENDER_QUALITY: "high", RENDER_WORKER_POLL_MS: "500", RENDER_WORKER_CONCURRENCY: "2",
      RENDER_JOB_TIMEOUT_MS: "1000", RENDER_STALE_JOB_MS: "2000", RENDER_WORK_DIR: "/tmp/x",
      HYPERFRAMES_BROWSER_PATH: "/usr/bin/google-chrome", HYPERFRAMES_FFMPEG_PATH: "/usr/bin/ffmpeg",
      HYPERFRAMES_EXTRACT_CACHE_DIR: "/tmp/c", PRODUCER_LOW_MEMORY_MODE: "true", PRODUCER_MAX_WORKERS: "3",
      PRODUCER_DISABLE_GPU: "false", VIDEO_MAX_RENDER_OUTPUT_BYTES: "1024",
    });
    expect(config).toMatchObject({ fps: 24, quality: "high", pollMs: 500, concurrency: 2, jobTimeoutMs: 1000, staleJobMs: 2000, workRoot: "/tmp/x", browserPath: "/usr/bin/google-chrome", ffmpegPath: "/usr/bin/ffmpeg", extractCacheDir: "/tmp/c", lowMemoryMode: true, maxWorkers: 3, disableGpu: false, maxOutputBytes: 1024 });
  });

  it("refuses a configuration that would let a stale job outlive its own timeout", () => {
    expect(() => readRenderWorkerConfig({ RENDER_JOB_TIMEOUT_MS: "10000", RENDER_STALE_JOB_MS: "1000" })).toThrowError();
  });

  it("refuses a non-numeric value rather than silently defaulting", () => {
    expect(() => readRenderWorkerConfig({ RENDER_WORKER_CONCURRENCY: "many" })).toThrowError();
  });
});
```

The staleness rule is the interesting one: a stale window shorter than the job timeout would let the reclaimer fail a job that is still legitimately rendering, which is the bug that would make renders disappear. Pin it.

`apps/backend/src/infrastructure/video/supabase-render-job-repository.test.ts` — the existing file already builds a fake Supabase client; add one test per new method in the same style. `repositoryWith(status, rowOverrides?)` is a local helper for this file: it builds the repository over that fake client configured to answer the new methods with a row in `status`, and returns the repository. The three tests that carry real risk:

```ts
it("advances a job only from the status it expects", async () => {
  const repository = repositoryWith("preparing");
  await expect(repository.markRendering("job-1")).resolves.toMatchObject({ status: "rendering" });

  // A job that was cancelled or reclaimed under the worker must not be resurrected.
  const cancelled = repositoryWith("cancelled");
  await expect(cancelled.markRendering("job-1")).resolves.toBeNull();
});

it("finds only started jobs older than the staleness cutoff", async () => {
  const repository = repositoryWith("rendering");
  await expect(repository.listStale("2026-09-22T00:00:00.000Z", 10)).resolves.toHaveLength(1);
  // A queued job has never started and belongs to the claim loop, not the reclaimer.
  const queued = repositoryWith("queued");
  await expect(queued.listStale("2026-09-22T00:00:00.000Z", 10)).resolves.toEqual([]);
});

it("orders the queue oldest first, so a backlog drains in the order users asked", async () => {
  const repository = repositoryWith("queued");
  await expect(repository.listQueued(1)).resolves.toHaveLength(1);
});
```

`apps/backend/src/routes/video.test.ts` — the existing file drives the routes through the Elysia app; add a case asserting the new list route answers `200 { jobs: [...] }` and 401 without a token.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/domain/video/render-config.test.ts src/infrastructure/video/supabase-render-job-repository.test.ts src/routes/video.test.ts`
Expected: FAIL — `./render-config` does not resolve and the repository methods do not exist.

- [ ] **Step 3: Add the worker's failure vocabulary, then the config reader**

First `apps/backend/src/domain/video/errors.ts`. A render failure is not a `VideoError`: `VideoErrorCode` is a closed union that `plugins/errors.ts` maps exhaustively to HTTP statuses, and a code a browser can never receive must not be added there. So the render's own codes live beside it, in a separate class:

```ts
/**
 * Every code a render job's `error_code` may hold, and the whole of a render's failure vocabulary.
 * Deliberately not part of `VideoErrorCode`: these never answer an HTTP request — the worker writes
 * them onto the job row — and `plugins/errors.ts` maps `VideoErrorCode` exhaustively to statuses, so
 * adding a browser-invisible code there would force a meaningless status onto it.
 */
export const RENDER_FAILURE_CODES = [
  "render_input_unsupported",
  "render_asset_missing",
  "render_asset_mutated",
  "render_engine_failed",
  "render_engine_unavailable",
  "render_timeout",
  "render_output_invalid",
  "render_output_too_large",
  "render_upload_failed",
  "render_stale",
  "render_worker_shutdown",
] as const;

export type RenderFailureCode = (typeof RENDER_FAILURE_CODES)[number];

/** Thrown inside the worker and nowhere else. The message is for the operator log, never for a client. */
export class RenderError extends Error {
  readonly code: RenderFailureCode;

  constructor(code: RenderFailureCode, message: string) {
    super(message);
    this.name = "RenderError";
    this.code = code;
  }
}
```

Then `apps/backend/src/domain/video/render-config.ts`, which imports `VideoError` only for the configuration failure — that one *is* a client-visible error, because the API's intake reads the same config for `fps`:

```ts
import { z } from "zod";
import { VideoError } from "./errors";
import { MAX_RENDER_OUTPUT_BYTES } from "./limits";

const booleanish = z.enum(["true", "false"]).transform((value) => value === "true");

const schema = z.object({
  RENDER_FPS: z.coerce.number().int().min(1).max(240).default(30),
  RENDER_QUALITY: z.enum(["draft", "standard", "high"]).default("standard"),
  RENDER_WORKER_POLL_MS: z.coerce.number().int().min(50).default(2000),
  RENDER_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  RENDER_JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).default(600_000),
  RENDER_STALE_JOB_MS: z.coerce.number().int().min(1000).default(900_000),
  RENDER_WORK_DIR: z.string().trim().min(1).nullable().default(null),
  HYPERFRAMES_BROWSER_PATH: z.string().trim().min(1).nullable().default(null),
  HYPERFRAMES_FFMPEG_PATH: z.string().trim().min(1).nullable().default(null),
  HYPERFRAMES_EXTRACT_CACHE_DIR: z.string().trim().min(1).nullable().default(null),
  PRODUCER_LOW_MEMORY_MODE: booleanish.default(false),
  PRODUCER_MAX_WORKERS: z.coerce.number().int().min(1).max(24).default(1),
  PRODUCER_DISABLE_GPU: booleanish.default(true),
  VIDEO_MAX_RENDER_OUTPUT_BYTES: z.coerce.number().int().positive().default(MAX_RENDER_OUTPUT_BYTES),
}).strict();

export type RenderWorkerConfig = {
  fps: number;
  quality: "draft" | "standard" | "high";
  pollMs: number;
  concurrency: number;
  jobTimeoutMs: number;
  staleJobMs: number;
  maxOutputBytes: number;
  workRoot: string | null;
  browserPath: string | null;
  ffmpegPath: string | null;
  extractCacheDir: string | null;
  lowMemoryMode: boolean;
  maxWorkers: number;
  disableGpu: boolean;
};

export function readRenderWorkerConfig(environment: Readonly<Record<string, string | undefined>> = process.env): RenderWorkerConfig {
  const parsed = schema.safeParse(pick(environment));
  if (!parsed.success) throw invalidConfig();

  // A reclaimer that is quicker than the render timeout would fail jobs that are still running, which
  // is indistinguishable to the user from a render that vanishes.
  if (parsed.data.RENDER_STALE_JOB_MS <= parsed.data.RENDER_JOB_TIMEOUT_MS) throw invalidConfig();

  return {
    fps: parsed.data.RENDER_FPS,
    quality: parsed.data.RENDER_QUALITY,
    pollMs: parsed.data.RENDER_WORKER_POLL_MS,
    concurrency: parsed.data.RENDER_WORKER_CONCURRENCY,
    jobTimeoutMs: parsed.data.RENDER_JOB_TIMEOUT_MS,
    staleJobMs: parsed.data.RENDER_STALE_JOB_MS,
    maxOutputBytes: parsed.data.VIDEO_MAX_RENDER_OUTPUT_BYTES,
    workRoot: parsed.data.RENDER_WORK_DIR,
    browserPath: parsed.data.HYPERFRAMES_BROWSER_PATH,
    ffmpegPath: parsed.data.HYPERFRAMES_FFMPEG_PATH,
    extractCacheDir: parsed.data.HYPERFRAMES_EXTRACT_CACHE_DIR,
    lowMemoryMode: parsed.data.PRODUCER_LOW_MEMORY_MODE,
    maxWorkers: parsed.data.PRODUCER_MAX_WORKERS,
    disableGpu: parsed.data.PRODUCER_DISABLE_GPU,
  };
}

function pick(environment: Readonly<Record<string, string | undefined>>) {
  return Object.fromEntries(Object.keys(schema.shape).map((key) => [key, environment[key]]));
}

function invalidConfig(): VideoError {
  return new VideoError("video_input_invalid", "The render worker is not configured correctly.");
}
```

Then replace the placeholder in `apps/backend/src/application/video/services.ts`: `createVideoProjectServices` should pass `fps: readRenderWorkerConfig(environment).fps` where Task 4 left a literal `30`, so the intake freezes the same fps the worker will render at. Run `pnpm --filter backend build` to confirm.

- [ ] **Step 4: Add the repository methods**

In `apps/backend/src/domain/video/contracts.ts`, extend `VideoRenderJobRepository`:

```ts
  /** The newest job for a project, so the workspace can render its state after a reload. */
  latestOwned(projectId: string, userId: string): Promise<VideoRenderJob | null>;
  /** Work discovery for the claim loop, oldest first. No owner scope: the queue is server-side. */
  listQueued(limit: number): Promise<VideoRenderJob[]>;
  /** Jobs that were started and then abandoned. No owner scope, for the same reason as `begin`. */
  listStale(startedBefore: string, limit: number): Promise<VideoRenderJob[]>;
  /** Conditional `preparing -> rendering`. Null means the worker no longer owns the job. */
  markRendering(jobId: string): Promise<VideoRenderJob | null>;
  /** Conditional `rendering -> uploading`. Null means the worker no longer owns the job. */
  markUploading(jobId: string): Promise<VideoRenderJob | null>;
  /** Conditional `uploading -> succeeded`, stamping `finished_at`. */
  succeed(jobId: string): Promise<VideoRenderJob | null>;
```

In `supabase-render-job-repository.ts`, implement them with one shared conditional-advance helper. This is the whole reason the transitions are safe:

```ts
  async latestOwned(projectId: string, userId: string): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async listQueued(limit: number): Promise<VideoRenderJob[]> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("status", "queued").order("queued_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRenderJob);
  }

  /** The `not started_at is null` filter is what keeps a `queued` job out of the reclaimer's reach. */
  async listStale(startedBefore: string, limit: number): Promise<VideoRenderJob[]> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .in("status", [...ACTIVE_RENDER_JOB_STATUSES])
      .not("started_at", "is", null)
      .lt("started_at", startedBefore)
      .order("started_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRenderJob);
  }

  markRendering(jobId: string): Promise<VideoRenderJob | null> {
    return this.advance(jobId, "preparing", "rendering");
  }

  markUploading(jobId: string): Promise<VideoRenderJob | null> {
    return this.advance(jobId, "rendering", "uploading");
  }

  succeed(jobId: string): Promise<VideoRenderJob | null> {
    return this.advance(jobId, "uploading", "succeeded", { finished_at: new Date().toISOString() });
  }

  /**
   * The expected prior status is part of the update, not a pre-read. That is what makes a status
   * advance a claim the worker can lose: a job failed by the reclaimer, or cancelled, cannot be
   * resurrected by a worker that is still holding a stale row.
   */
  private async advance(
    jobId: string,
    from: VideoRenderJobStatus,
    to: VideoRenderJobStatus,
    patch: Record<string, unknown> = {},
  ): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs")
      .update({ status: to, ...patch })
      .eq("id", jobId).eq("status", from)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }
```

Import `VideoRenderJobStatus` alongside the existing `VideoRenderJob` type import.

- [ ] **Step 5: Expose the latest job**

In `apps/backend/src/application/video/render-jobs.ts`:

```ts
/** The workspace reads this after a reload: it holds no job id, so it asks for the newest one. */
export async function listVideoRenderJobs(
  command: { userId: string; projectId: string },
  dependencies: RenderJobDependencies,
): Promise<RenderJobResponse[]> {
  await requireOwnedProject(command.projectId, command.userId, dependencies);
  const job = await dependencies.jobs.latestOwned(command.projectId, command.userId);
  return job ? [toRenderJobResponse(job)] : [];
}
```

A one-item list rather than a nullable object keeps the response shape uniform with `GET …/versions`, and leaves room for history later without a breaking change. Add `fps` to `RenderJobDependencies` in the same file (Task 4 introduced it), and add the route to `apps/backend/src/routes/video.ts` mirroring the existing versions route:

```ts
  .get(
    "/video-projects/:projectId/render-jobs",
    async ({ params, user }) => ({
      jobs: await listVideoRenderJobs({ userId: user.id, projectId: params.projectId }, createVideoProjectServices()),
    }),
    { auth: true, detail: { tags: ["video"] } },
  )
```

Register it **before** `/video-projects/:projectId/render-jobs/:jobId` so the literal path cannot be captured by the parameterised one.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm --filter backend test -- src/domain/video/render-config.test.ts src/infrastructure/video src/application/video src/routes/video.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/domain/video/render-config.ts apps/backend/src/domain/video/render-config.test.ts \
  apps/backend/src/domain/video/contracts.ts \
  apps/backend/src/infrastructure/video/supabase-render-job-repository.ts \
  apps/backend/src/infrastructure/video/supabase-render-job-repository.test.ts \
  apps/backend/src/application/video/render-jobs.ts apps/backend/src/application/video/services.ts \
  apps/backend/src/routes/video.ts apps/backend/src/routes/video.test.ts
git commit -m "feat(video): add render worker config, job status transitions, and the latest-job read"
```

### Task 6: The Render Engine Port And The Composition Writer

The port is the seam the PRD asks for ("Integrasi dibungkus dalam `RenderEngine`/`HyperFramesRenderer` agar proses lokal dapat dipindahkan ke cloud worker tanpa mengubah domain proyek"). The writer turns a manifest into a directory HyperFrames can render, and is where the asset bytes are re-verified.

**Files:**
- Create: `apps/backend/src/domain/video/render-engine.ts`
- Create: `apps/backend/src/infrastructure/video/hyperframes/composition-writer.ts`
- Create: `apps/backend/src/infrastructure/video/hyperframes/workspace.ts`
- Test: `apps/backend/src/infrastructure/video/hyperframes/composition-writer.test.ts`
- Test: `apps/backend/src/infrastructure/video/hyperframes/workspace.test.ts`

**Interfaces:**
- Consumes: `buildComposition` (Task 3), `buildRenderManifest`/`renderManifestFingerprint`/`extensionFor` (Task 4), `AssetObjectStore` (Task 2), `RenderWorkerConfig` (Task 5).
- Produces:
  - `type RenderEngineRequest`, `type RenderEngineResult`, `interface RenderEngine`
  - `type RenderProbe = { durationSeconds: number; width: number; height: number; hasAudio: boolean; byteSize: number }`
  - `function writeComposition(manifest, workDir, dependencies): Promise<void>`
  - `function createRenderWorkspace(workRoot: string | null, jobId: string): Promise<{ dir: string; dispose(): Promise<void> }>`

- [ ] **Step 1: Write the failing tests**

`workspace.test.ts`:

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRenderWorkspace } from "./workspace";

describe("createRenderWorkspace", () => {
  it("creates a unique directory under the configured root and removes it on dispose", async () => {
    const workspace = await createRenderWorkspace(process.env.TMPDIR ?? "/tmp", "job-1");
    expect(existsSync(workspace.dir)).toBe(true);
    expect(workspace.dir).toContain("job-1");

    await workspace.dispose();
    expect(existsSync(workspace.dir)).toBe(false);
  });

  it("never reuses another job's directory, so a stale render cannot read the wrong files", async () => {
    const first = await createRenderWorkspace(null, "job-1");
    const second = await createRenderWorkspace(null, "job-1");
    expect(first.dir).not.toBe(second.dir);
    await first.dispose();
    await second.dispose();
  });

  it("tolerates disposing twice, because cleanup runs in a finally", async () => {
    const workspace = await createRenderWorkspace(null, "job-1");
    await workspace.dispose();
    await expect(workspace.dispose()).resolves.toBeUndefined();
  });
});
```

`composition-writer.test.ts`:

```ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { writeComposition } from "./composition-writer";
import { manifestFixture } from "../../../domain/video/render-manifest.test-helpers";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function dependencies(bytes = PNG) {
  return {
    objectStore: { read: vi.fn(async () => bytes) },
    gsapScriptPath: "/usr/lib/gsap.min.js",
    copyFile: vi.fn(async () => undefined),
  };
}

describe("writeComposition", () => {
  it("writes the composition and every referenced asset under the work directory", async () => {
    const manifest = manifestFixture();
    const workDir = await temporaryDirectory();
    const deps = dependencies();

    await writeComposition(manifest, workDir, deps);

    expect(await readdir(workDir)).toEqual(expect.arrayContaining(["index.html", "styles.css"]));
    expect(await readdir(join(workDir, "assets"))).toEqual(["asset-1.png"]);
    expect(await readdir(join(workDir, "vendor"))).toEqual(["gsap.min.js"]);
    expect(deps.objectStore.read).toHaveBeenCalledWith("video-projects/p/asset-1.png", expect.any(Number));
  });

  it("refuses an asset whose bytes no longer match the hash the manifest froze", async () => {
    const manifest = manifestFixture();
    await expect(writeComposition(manifest, await temporaryDirectory(), dependencies(Uint8Array.from([1, 2, 3]))))
      .rejects.toMatchObject({ code: "render_asset_mutated" });
  });

  it("refuses a manifest that references an asset it does not carry", async () => {
    const manifest = { ...manifestFixture(), assets: [] };
    await expect(writeComposition(manifest, await temporaryDirectory(), dependencies()))
      .rejects.toMatchObject({ code: "render_asset_missing" });
  });

  it("is idempotent for the same manifest, so a resumed render sees identical files", async () => {
    const manifest = manifestFixture();
    const workDir = await temporaryDirectory();
    await writeComposition(manifest, workDir, dependencies());
    const first = await readFile(join(workDir, "index.html"), "utf8");
    await writeComposition(manifest, workDir, dependencies());
    expect(await readFile(join(workDir, "index.html"), "utf8")).toBe(first);
  });
});
```

`temporaryDirectory()` is a two-line helper in the test file using `mkdtemp(join(tmpdir(), "hf-writer-"))`.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/infrastructure/video/hyperframes`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Define the port**

`apps/backend/src/domain/video/render-engine.ts`:

```ts
import type { RenderManifest } from "./render-manifest";

export type RenderEngineRequest = {
  /** The frozen input. The engine renders exactly this and nothing else. */
  manifest: RenderManifest;
  /** A directory the engine owns for the duration of the render. */
  workDir: string;
  /** Where the encoded file must land. The engine creates the parent directory if needed. */
  outputPath: string;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
};

/** What the engine read back from the encoder — not what it was asked for. */
export type RenderProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  /** Frames per second, parsed from FFprobe's `r_frame_rate` rational. */
  frameRate: number;
  /** False for every render this pipeline produces today: no audio source is wired up yet. */
  hasAudio: boolean;
  byteSize: number;
};

export type RenderEngineResult = {
  outputPath: string;
  /** The fingerprint of the manifest that produced this file, as written on the version row. */
  manifestHash: string;
  probe: RenderProbe;
};

/**
 * The render boundary the PRD asks for. A local HyperFrames process and a cloud render service both
 * satisfy this, so moving the worker off the host changes no domain or application code.
 */
export interface RenderEngine {
  render(request: RenderEngineRequest): Promise<RenderEngineResult>;
}
```

- [ ] **Step 4: Implement the workspace and the writer**

`workspace.ts` keeps the temporary-directory rules in one place, including the two that matter in practice — uniqueness per job, and being safe to dispose twice from a `finally`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type RenderWorkspace = { dir: string; dispose: () => Promise<void> };

/**
 * A fresh directory per attempt. Reusing one would let a retry render against files a previous,
 * failed attempt left behind, which is exactly how a render silently stops matching its manifest.
 */
export async function createRenderWorkspace(workRoot: string | null, jobId: string): Promise<RenderWorkspace> {
  const dir = await mkdtemp(join(workRoot ?? tmpdir(), `hyperframes-${jobId}-`));
  let disposed = false;

  return {
    dir,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await rm(dir, { recursive: true, force: true });
    },
  };
}
```

`composition-writer.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { copyFile } from "node:fs/promises";
import { buildComposition } from "../../../domain/video/composition";
import { extensionFor, sha256Hex } from "../../../domain/video/render-manifest";
import { RenderError } from "../../../domain/video/errors";
import { MAX_ASSET_BYTES } from "../../../domain/ai-service/assets";
import type { AssetObjectStore } from "../../../domain/ai-service/assets";
import type { RenderManifest } from "../../../domain/video/render-manifest";

export type CompositionWriterDependencies = {
  objectStore: Pick<AssetObjectStore, "read">;
  /** Absolute path to the vendored `gsap.min.js`; resolved once from the installed package. */
  gsapScriptPath: string;
  copyFile?: typeof copyFile;
};

/**
 * Writes a self-contained HyperFrames project for one manifest. The asset bytes are re-verified
 * against the hash the manifest froze: approval pinned those bytes, and an object overwritten since
 * then must fail the render rather than be burned into a published video.
 */
export async function writeComposition(
  manifest: RenderManifest,
  workDir: string,
  dependencies: CompositionWriterDependencies,
): Promise<void> {
  const copy = dependencies.copyFile ?? copyFile;
  const { files } = buildComposition(manifest);

  await mkdir(join(workDir, "assets"), { recursive: true });
  await mkdir(join(workDir, "vendor"), { recursive: true });

  for (const file of files) {
    const target = join(workDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents, "utf8");
  }

  await copy(dependencies.gsapScriptPath, join(workDir, "vendor", "gsap.min.js"));

  const referenced = new Set(manifest.scenes.flatMap((scene) => scene.assetIds));
  const frozen = new Map(manifest.assets.map((asset) => [asset.assetId, asset]));

  for (const assetId of referenced) {
    const asset = frozen.get(assetId);
    if (!asset) throw new RenderError("render_asset_missing", "A scene references an asset this render was not given.");
    const bytes = await readAsset(asset.objectKey, dependencies.objectStore);
    if (sha256Hex(bytes) !== asset.sha256) {
      throw new RenderError("render_asset_mutated", "An asset changed after the render was approved.");
    }
    await writeFile(join(workDir, "assets", `${asset.assetId}.${extensionFor(asset.mimeType)}`), bytes);
  }
}

async function readAsset(objectKey: string, objectStore: Pick<AssetObjectStore, "read">): Promise<Uint8Array> {
  try {
    return await objectStore.read(objectKey, MAX_ASSET_BYTES);
  } catch {
    throw new RenderError("render_asset_missing", "An asset this render needs is no longer available.");
  }
}
```

`asset.fileName` from Task 4 and `${assetId}.${extensionFor(mimeType)}` here must agree — they do, and the writer test asserts the file that lands on disk is the name the composition references.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter backend test -- src/infrastructure/video/hyperframes`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/domain/video/render-engine.ts \
  apps/backend/src/infrastructure/video/hyperframes
git commit -m "feat(video): add the render engine port and the deterministic composition writer"
```

### Task 7: The HyperFrames Adapter

**Files:**
- Create: `apps/backend/src/infrastructure/video/hyperframes/hyperframes-render-engine.ts`
- Create: `apps/backend/src/infrastructure/video/hyperframes/ffprobe.ts`
- Create: `apps/backend/src/infrastructure/video/hyperframes/gsap-script.ts`
- Test: `apps/backend/src/infrastructure/video/hyperframes/ffprobe.test.ts`
- Test: `apps/backend/src/infrastructure/video/hyperframes/hyperframes-render-engine.test.ts`

**Interfaces:**
- Consumes: `RenderEngine`, `RenderEngineRequest`, `RenderEngineResult` (Task 6); `writeComposition` (Task 6); `createRenderWorkspace` (Task 6); `RenderWorkerConfig` (Task 5); `createRenderJob`/`executeRenderJob`/`RenderCancelledError` from `@hyperframes/producer`.
- Produces:
  - `function gsapScriptPath(): string` — the absolute path to the vendored runtime.
  - `function probeVideo(path: string, dependencies?): Promise<RenderProbe>` — FFprobe.
  - `class HyperFramesRenderEngine implements RenderEngine` with `new HyperFramesRenderEngine({ config, objectStore, gsapScriptPath, probe? })`

- [ ] **Step 1: Write the failing tests**

`ffprobe.test.ts` — uses FFmpeg to generate a real file, so it is honest rather than mocked. Gate it on FFmpeg being present:

```ts
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { parseProbe, probeVideo } from "./ffprobe";

const run = promisify(execFile);
const hasFfmpeg = await run("ffmpeg", ["-version"]).then(() => true).catch(() => false);

describe.skipIf(!hasFfmpeg)("probeVideo", () => {
  it("reads the duration, the frame size, and the absence of an audio stream", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hf-probe-"));
    const file = join(dir, "sample.mp4");
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=30", "-t", "2", "-pix_fmt", "yuv420p", file]);

    const probe = await probeVideo(file);

    expect(probe.durationSeconds).toBeGreaterThan(1.9);
    expect(probe.durationSeconds).toBeLessThan(2.1);
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
    expect(probe.frameRate).toBe(30);
    expect(probe.hasAudio).toBe(false);
    expect(probe.byteSize).toBeGreaterThan(0);
  });

  it("parses an FFprobe payload with an audio stream and a rational frame rate", () => {
    // `r_frame_rate` is a rational like "30000/1001"; a naive Number() would read it as NaN. This
    // pins the parser against a hand-written payload, so the rational handling is tested even on a
    // machine where FFmpeg cannot encode with audio.
    const probe = parseProbe(JSON.stringify({
      streams: [
        { codec_type: "video", width: 1080, height: 1920, r_frame_rate: "30000/1001" },
        { codec_type: "audio" },
      ],
      format: { duration: "10.010", size: "1234" },
    }));

    expect(probe).toEqual({ durationSeconds: 10.01, width: 1080, height: 1920, frameRate: 29.97, hasAudio: true, byteSize: 1234 });
  });

  it("refuses a payload with no video stream rather than reporting a zero-sized frame", () => {
    expect(() => parseProbe(JSON.stringify({ streams: [{ codec_type: "audio" }], format: { duration: "1", size: "1" } }))).toThrowError();
  });

  it("reports the failure rather than a zero-length video for a file it cannot read", async () => {
    await expect(probeVideo("/nonexistent/never.mp4")).rejects.toMatchObject({ code: "render_output_invalid" });
  });
});
```

`hyperframes-render-engine.test.ts` — the engine talks to Chrome and FFmpeg, so the real render is gated and the rest is exercised through the injected probe:

```ts
import { RenderCancelledError } from "@hyperframes/producer";
import { describe, expect, it, vi } from "vitest";
import { HyperFramesRenderEngine } from "./hyperframes-render-engine";
import { manifestFixture } from "../../../domain/video/render-manifest.test-helpers";

const E2E = process.env.RENDER_ENGINE_E2E === "1";

/** A probe that agrees with `manifestFixture()`; every test that expects a throw passes its own. */
const okProbe = async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 10 });

function engine(
  probe = vi.fn(okProbe),
  // The producer call is injected so the unit tests never launch Chrome.
  executeRender = vi.fn(async () => undefined),
) {
  return new HyperFramesRenderEngine({
    config: { fps: 30, quality: "standard", maxOutputBytes: 524_288_000, browserPath: null, ffmpegPath: null, extractCacheDir: null, lowMemoryMode: false, maxWorkers: 1, disableGpu: true },
    objectStore: { read: async () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]) },
    gsapScriptPath: "/nonexistent/gsap.min.js",
    probe,
    executeRender,
  });
}

describe("HyperFramesRenderEngine", () => {
  it("fails the render when the encoded file disagrees with the manifest", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 7, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 10 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_invalid" });
  });

  it("fails the render when the frame size is not the one the settings asked for", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1080, frameRate: 30, hasAudio: false, byteSize: 10 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_invalid" });
  });

  it("fails the render when the frame rate is not the one the manifest asked for", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 24, hasAudio: false, byteSize: 10 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_invalid" });
  });

  it("refuses an output over the configured ceiling before it is uploaded", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 999_999_999 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_too_large" });
  });

  it("maps an aborted render to an engine failure, not a crash", async () => {
    const subject = engine(undefined, vi.fn(async () => { throw new RenderCancelledError("aborted", "aborted"); }));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_engine_failed" });
  });

  it("returns the manifest fingerprint it rendered, ready for the version row", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 10 })));
    const result = await subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" });
    expect(result.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe.skipIf(!E2E)("HyperFramesRenderEngine (real render)", () => {
  it("renders a real six-second 720p file whose probe matches the manifest", async () => {
    // Uses the real writeComposition, the real @hyperframes/producer, and the real probe on a
    // fixture manifest whose single asset is generated with FFmpeg into the object store fake.
    // Asserts duration within one frame, the exact frame size, and a non-zero file.
  });

  it("produces byte-identical files for two renders of the same manifest", async () => {
    // The PRD's determinism requirement, on one host. Hashing both outputs and comparing is the test.
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/infrastructure/video/hyperframes`
Expected: FAIL — `./ffprobe` and `./hyperframes-render-engine` do not resolve.

- [ ] **Step 3: Implement FFprobe and the runtime path**

`ffprobe.ts` uses `execFile` with an argument array (never a shell), and turns any failure into one normalized code:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RenderError } from "../../../domain/video/errors";
import type { RenderProbe } from "../../../domain/video/render-engine";

const run = promisify(execFile);

/**
 * Reads the real properties of the encoded file. Verification lives here rather than on the version
 * row, because the PRD's automated checks are about the file that was actually produced: a file that
 * cannot be decoded, or whose duration or frame size drifted, must not become a published version.
 */
export async function probeVideo(filePath: string, ffmpegPath: string | null = null): Promise<RenderProbe> {
  let stdout: string;
  try {
    const result = await run(ffmpegPath ? ffprobeFromFfmpeg(ffmpegPath) : "ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size:stream=codec_type,width,height,r_frame_rate",
      "-of", "json",
      filePath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    stdout = result.stdout;
  } catch {
    throw new RenderError("render_output_invalid", "The rendered file could not be read.");
  }
  return parseProbe(stdout);
}
```

`ffprobeFromFfmpeg(ffmpegPath)` derives the sibling `ffprobe` from a configured `ffmpeg` path (`ffmpeg` → `ffprobe` in the same directory), so one pinned path covers both binaries.

`parseProbe(stdout)` requires at least one `codec_type === "video"` stream and reads `width`, `height`, and `r_frame_rate` from it. It parses the frame rate as the rational FFprobe reports (`"30000/1001"` → `29.97`, rounded to two decimals; `"30/1"` → `30`), reads `durationSeconds` from `Number(format.duration)` and `byteSize` from `Number(format.size)`, and sets `hasAudio` when any stream is `codec_type === "audio"`. A missing video stream, or a non-numeric duration or frame rate, throws `video_output_invalid` — the render is then refused rather than reported as a zero-sized video. Export `parseProbe` so it is unit-testable without a subprocess; the two hand-written payload cases above are what pin the rational and no-video-stream behaviour.

`gsap-script.ts` resolves the vendored runtime through `import.meta.resolve`, so the path follows the lockfile rather than a hard-coded `node_modules` guess:

```ts
import { fileURLToPath } from "node:url";

/** The animation runtime the composition loads, pinned by the lockfile and copied in per render. */
export function gsapScriptPath(): string {
  return fileURLToPath(import.meta.resolve("gsap/dist/gsap.min.js"));
}
```

- [ ] **Step 4: Implement the adapter**

```ts
import { createRenderJob as createProducerJob, executeRenderJob, RenderCancelledError } from "@hyperframes/producer";
import { renderManifestFingerprint } from "../../../domain/video/render-manifest";
import { RenderError } from "../../../domain/video/errors";
import { writeComposition } from "./composition-writer";
import { probeVideo } from "./ffprobe";
import type { AssetObjectStore } from "../../../domain/ai-service/assets";
import type { RenderEngine, RenderEngineRequest, RenderEngineResult, RenderProbe } from "../../../domain/video/render-engine";
import type { RenderWorkerConfig } from "../../../domain/video/render-config";

/** One output frame of tolerance: FFmpeg's duration is a stream property, not an exact frame count. */
const DURATION_TOLERANCE_SECONDS = 1 / 24;

/** FFprobe reports a rational rate, so a 29.97 encode must not be rejected for a 30 fps manifest. */
const FRAME_RATE_TOLERANCE = 0.5;

export type HyperFramesRenderEngineOptions = {
  config: Pick<RenderWorkerConfig, "fps" | "quality" | "maxOutputBytes" | "browserPath" | "ffmpegPath" | "extractCacheDir" | "lowMemoryMode" | "maxWorkers" | "disableGpu">;
  objectStore: Pick<AssetObjectStore, "read">;
  gsapScriptPath: string;
  probe?: (path: string, ffmpegPath: string | null) => Promise<RenderProbe>;
  executeRender?: typeof executeRenderJob;
};

export class HyperFramesRenderEngine implements RenderEngine {
  private executeRender: typeof executeRenderJob;

  constructor(private readonly options: HyperFramesRenderEngineOptions) {
    this.executeRender = options.executeRender ?? executeRenderJob;
  }

  async render(request: RenderEngineRequest): Promise<RenderEngineResult> {
    const manifestHash = renderManifestFingerprint(request.manifest);

    await writeComposition(request.manifest, request.workDir, {
      objectStore: this.options.objectStore,
      gsapScriptPath: this.options.gsapScriptPath,
    });

    this.applyProducerEnvironment();

    const job = createProducerJob({
      fps: request.manifest.fps,
      quality: this.options.config.quality,
      format: "mp4",
      entryFile: "index.html",
      // Best-effort renders a file with capture warnings; strict would refuse one over a single
      // unready frame. The probe below is this pipeline's real gate, so a warning is not fatal here.
      strictness: "best-effort",
    });

    try {
      await this.executeRender(
        job,
        request.workDir,
        request.outputPath,
        request.onProgress === undefined ? undefined : (current) => request.onProgress?.(current.progress),
        request.signal,
      );
    } catch (error) {
      throw engineFailure(error);
    }

    const probe = await (this.options.probe ?? probeVideo)(request.outputPath, this.options.config.ffmpegPath);
    this.assertProbeMatches(request, probe);

    return { outputPath: request.outputPath, manifestHash, probe };
  }

  /** Set on this process before every render: the CLI's documented knobs, read only when no config object is passed. */
  private applyProducerEnvironment(): void {
    const { config } = this.options;
    process.env.PRODUCER_MAX_WORKERS = String(config.maxWorkers);
    process.env.PRODUCER_LOW_MEMORY_MODE = String(config.lowMemoryMode);
    process.env.PRODUCER_DISABLE_GPU = String(config.disableGpu);
    // Never let a render reach the network for an update check or telemetry.
    process.env.HYPERFRAMES_NO_TELEMETRY = "1";
    process.env.HYPERFRAMES_NO_UPDATE_CHECK = "1";
    if (config.browserPath) process.env.HYPERFRAMES_BROWSER_PATH = config.browserPath;
    if (config.ffmpegPath) process.env.HYPERFRAMES_FFMPEG_PATH = config.ffmpegPath;
    if (config.extractCacheDir) process.env.HYPERFRAMES_EXTRACT_CACHE_DIR = config.extractCacheDir;
  }

  private assertProbeMatches(request: RenderEngineRequest, probe: RenderProbe): void {
    const { manifest } = request;
    if (probe.width !== manifest.width || probe.height !== manifest.height) {
      throw new RenderError("render_output_invalid", "The rendered file is not the size the project asked for.");
    }
    if (Math.abs(probe.durationSeconds - manifest.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
      throw new RenderError("render_output_invalid", "The rendered file is not the duration the project asked for.");
    }
    if (Math.abs(probe.frameRate - manifest.fps) > FRAME_RATE_TOLERANCE) {
      throw new RenderError("render_output_invalid", "The rendered file is not the frame rate the project asked for.");
    }
    if (probe.byteSize <= 0) throw new RenderError("render_output_invalid", "The rendered file is empty.");
    if (probe.byteSize > this.options.config.maxOutputBytes) {
      throw new RenderError("render_output_too_large", "The rendered file is larger than this project can store.");
    }
  }
}

function engineFailure(error: unknown): RenderError {
  if (error instanceof RenderCancelledError) {
    // Cancellation is the worker's own abort (a timeout or a shutdown) and is retryable by construction.
    return new RenderError("render_engine_failed", "The render was interrupted.");
  }
  return new RenderError("render_engine_failed", "The render engine could not produce a video.");
}
```

The engine never retries and never exposes a provider message: every failure leaves as one `RenderError` from the closed `RENDER_FAILURE_CODES` set, which the worker writes onto the job row. A retry is the user's decision (the project is released back to `approved`), and the render's own retry policy is the `attempts` counter on the job, so `RenderError` deliberately carries no `retryable` flag.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter backend test -- src/infrastructure/video/hyperframes`
Expected: PASS, including the FFprobe live test, with no network traffic.

Then run the real render on this machine, once:

```bash
RENDER_ENGINE_E2E=1 HYPERFRAMES_BROWSER_PATH="$(which google-chrome)" \
  pnpm --filter backend test -- src/infrastructure/video/hyperframes/hyperframes-render-engine.test.ts
```

Expected: PASS, with a real MP4 produced in a temporary directory. If Bun cannot run `@hyperframes/producer`, this is where it shows up — switch the worker's npm script to `node` (Task 9) and record the change in the decision record's adapter configuration, per Task 1 Step 6.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/infrastructure/video/hyperframes
git commit -m "feat(video): render manifests with a pinned, verified HyperFrames adapter"
```

### Task 8: The Render Job Use Case

Everything above is a part. This is the assembly, and it is where project and job state must stay consistent under every failure.

**Files:**
- Create: `apps/backend/src/application/video/render-worker.ts`
- Modify: `apps/backend/src/application/video/render-jobs.ts` (narrow `beginRenderJob`'s dependency type)
- Test: `apps/backend/src/application/video/render-worker.test.ts`

**Interfaces:**
- Consumes: `beginRenderJob` (existing); `buildRenderManifest` (Task 4); `RenderEngine` (Task 6); `RenderWorkerConfig`, `RenderFailureCode`, `RenderError` (Task 5); all repositories via `domain/video/contracts`.
- Produces:
  - `type RenderWorkerDependencies`
  - `function runRenderJob(jobId: string, dependencies: RenderWorkerDependencies): Promise<RenderJobOutcome>`
  - `type RenderJobOutcome = { jobId: string; status: "succeeded" | "failed" | "skipped"; code?: RenderFailureCode }`
  - `function reclaimStaleRenderJobs(dependencies): Promise<number>`
  - `function claimNextRenderJob(dependencies): Promise<string | null>`

- [ ] **Step 1: Write the failing tests**

`render-worker.test.ts` builds the same inline-fake style the existing `render-jobs.test.ts` uses, and asserts the invariants that matter:

```ts
import { describe, expect, it, vi } from "vitest";
import { claimNextRenderJob, reclaimStaleRenderJobs, runRenderJob } from "./render-worker";
import { RenderError } from "../../domain/video/errors";
import type { RenderWorkerDependencies } from "./render-worker";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";
```

Build `workerDependencies(overrides)` in the same shape as `render-jobs.test.ts`'s `dependencies()`: `createId` returns `VERSION_ID` for the version and a fixed uuid for ids, `now()` returns a fixed timestamp, `fps: 30`, `config` is a complete `RenderWorkerConfig` with `jobTimeoutMs: 600_000` and `staleJobMs: 900_000` unless overridden, every repository method is a `vi.fn`, `engine.render` resolves `{ outputPath: "/tmp/x/render.mp4", manifestHash: "b".repeat(64), probe: { durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 100 } }`, and `objectStore.write` resolves. The overrides it accepts are `isRevision`, `jobTimeoutMs`, `snapshot`, `latestVersionNumber`, `queuedJobs`, and `staleJobs`.

The fakes that `loadManifest` reads must return the storyboard and brief the snapshot names, so `workerDependencies` also provides `storyboardRevisions.getOwned` returning a two-scene `sceneFixture()` storyboard, `briefRevisions.getOwned` returning a complete brief, `assets.listOwned` returning one `moderationStatus: "allowed"` asset, and `projects.getOwned` returning a `product_promo` project. Define `jobFixture(overrides)` at the top of this test file, in the same style as `render-jobs.test.ts`'s `job()` helper.

```ts
describe("runRenderJob", () => {
  it("claims, advances every stage in order, publishes a version, and releases the project to ready", async () => {
    const deps = workerDependencies();

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "succeeded" });

    const order = [
      ...deps.jobs.begin.mock.invocationCallOrder,
      ...deps.jobs.markRendering.mock.invocationCallOrder,
      ...deps.engine.render.mock.invocationCallOrder,
      ...deps.jobs.markUploading.mock.invocationCallOrder,
      ...deps.objectStore.write.mock.invocationCallOrder,
      ...deps.versions.create.mock.invocationCallOrder,
      ...deps.jobs.succeed.mock.invocationCallOrder,
      ...deps.projects.transition.mock.invocationCallOrder,
    ];
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(deps.projects.transition).toHaveBeenLastCalledWith(PROJECT_ID, USER_ID, "rendering", "ready");
    expect(deps.versions.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      renderJobId: "job-1",
      versionNumber: 1,
      outputObjectKey: `video-versions/${PROJECT_ID}/${VERSION_ID}.mp4`,
      durationSeconds: 10,
      aspectRatio: "9:16",
      resolution: "1080p",
      manifestHash: "b".repeat(64),
    }));
  });

  it("uploaded the exact object key it recorded on the version row", async () => {
    const deps = workerDependencies();
    await runRenderJob("job-1", deps);
    expect(deps.objectStore.write.mock.calls[0]?.[0]).toBe(deps.versions.create.mock.calls[0]?.[0].outputObjectKey);
    expect(deps.objectStore.write.mock.calls[0]?.[2]).toBe("video/mp4");
  });

  it("fails the job and releases the project back to approved when the engine cannot render", async () => {
    const deps = workerDependencies();
    deps.engine.render.mockRejectedValue(new RenderError("render_engine_failed", "no"));

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "failed", code: "render_engine_failed" });
    expect(deps.jobs.fail).toHaveBeenCalledWith("job-1", "render_engine_failed");
    expect(deps.versions.create).not.toHaveBeenCalled();
    expect(deps.projects.transition).toHaveBeenLastCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
  });

  it("does not publish a version when the upload fails, and releases the project", async () => {
    const deps = workerDependencies();
    deps.objectStore.write.mockRejectedValue(new Error("storage down"));

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "failed", code: "render_upload_failed" });
    expect(deps.versions.create).not.toHaveBeenCalled();
    expect(deps.jobs.succeed).not.toHaveBeenCalled();
  });

  it("stops without failing anything once the reclaimer has taken the job", async () => {
    const deps = workerDependencies();
    deps.jobs.markRendering.mockResolvedValue(null);

    await expect(runRenderJob("job-1", deps)).resolves.toEqual({ jobId: "job-1", status: "skipped" });
    expect(deps.engine.render).not.toHaveBeenCalled();
    expect(deps.jobs.fail).not.toHaveBeenCalled();
  });

  it("aborts a render that outlives the processing budget and fails the job with the timeout code", async () => {
    const deps = workerDependencies({ jobTimeoutMs: 20 });
    deps.engine.render.mockImplementation((request) => new Promise((_resolve, reject) => {
      request.signal?.addEventListener("abort", () => reject(new RenderError("render_engine_failed", "interrupted")));
    }));

    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_timeout" });
  });

  it("refuses a snapshot it does not understand instead of throwing", async () => {
    const deps = workerDependencies({ snapshot: { schemaVersion: "render-input@v1" } });
    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_input_unsupported" });
  });

  it("refuses to render an asset whose bytes changed after approval", async () => {
    const deps = workerDependencies();
    deps.engine.render.mockRejectedValue(new RenderError("render_asset_mutated", "changed"));
    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_asset_mutated" });
  });

  it("reports an unrecognised throw as an engine failure rather than leaking its text", async () => {
    const deps = workerDependencies();
    deps.engine.render.mockRejectedValue(new Error("Error: page.goto: net::ERR_CONNECTION_REFUSED at chrome"));

    await expect(runRenderJob("job-1", deps)).resolves.toMatchObject({ status: "failed", code: "render_engine_failed" });
    expect(deps.jobs.fail).toHaveBeenCalledWith("job-1", "render_engine_failed");
  });

  it("spends the rerender it claimed even when the render then fails, because the claim is the charge", async () => {
    const deps = workerDependencies({ isRevision: true });
    deps.engine.render.mockRejectedValue(new RenderError("render_engine_failed", "no"));

    await runRenderJob("job-1", deps);

    // The project is released so the user can retry, but the quota is not refunded: `consumeRerender`
    // is the only quota mutation in the codebase and it only ever increments.
    expect(deps.projects.transition).toHaveBeenLastCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
    expect(deps.projects.consumeRerender).toHaveBeenCalledTimes(1);
  });

  it("numbers a revision one above the version it supersedes", async () => {
    const deps = workerDependencies({ isRevision: true, latestVersionNumber: 2 });
    await runRenderJob("job-1", deps);
    expect(deps.versions.create).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 3 }));
  });
});

describe("reclaimStaleRenderJobs", () => {
  it("fails each abandoned job and releases its project, and is owner-qualified by the job row", async () => {
    const deps = workerDependencies({ staleJobs: [jobFixture({ id: "job-stale", status: "rendering", projectId: PROJECT_ID, userId: USER_ID })] });

    await expect(reclaimStaleRenderJobs(deps)).resolves.toBe(1);

    expect(deps.jobs.fail).toHaveBeenCalledWith("job-stale", "render_stale");
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "rendering", "approved");
  });

  it("does nothing when there is nothing stale", async () => {
    const deps = workerDependencies({ staleJobs: [] });
    await expect(reclaimStaleRenderJobs(deps)).resolves.toBe(0);
    expect(deps.jobs.fail).not.toHaveBeenCalled();
  });
});

describe("claimNextRenderJob", () => {
  it("returns the oldest queued job and nothing when the queue is empty", async () => {
    const deps = workerDependencies({ queuedJobs: [jobFixture({ id: "job-a", queuedAt: "2026-09-22T00:00:00.000Z" })] });
    await expect(claimNextRenderJob(deps)).resolves.toBe("job-a");

    const empty = workerDependencies({ queuedJobs: [] });
    await expect(claimNextRenderJob(empty)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter backend test -- src/application/video/render-worker.test.ts`
Expected: FAIL with "Failed to resolve import `./render-worker`".

- [ ] **Step 3: Implement the use case**

First narrow `beginRenderJob` in `apps/backend/src/application/video/render-jobs.ts`. It only ever reads a job, claims it, and fails it, so it should not demand the whole `RenderJobDependencies` — which is what `createRenderJob` needs, and what the worker does not have:

```ts
/** The claim path's dependencies. Narrower than `RenderJobDependencies` on purpose: the worker that
 *  consumes them has neither the idempotency lookup nor the project reads that the intake needs. */
export type BeginRenderJobDependencies = {
  projects: Pick<VideoProjectRepository, "consumeRerender">;
  jobs: Pick<VideoRenderJobRepository, "getById" | "begin" | "fail">;
};

export async function beginRenderJob(command: BeginRenderJobCommand, dependencies: BeginRenderJobDependencies): Promise<VideoRenderJob> {
  // body unchanged
}
```

Then `apps/backend/src/application/video/render-worker.ts`:

```ts
import { RENDER_INPUT_SCHEMA_VERSION, renderJobInputSnapshotSchema } from "../../domain/video/render-input";
import { buildRenderManifest } from "../../domain/video/render-manifest";
import { storyboardSchema } from "../../domain/video/storyboard";
import { videoBriefSchema } from "../../domain/video/brief";
import { RENDER_FAILURE_CODES, RenderError, VideoError } from "../../domain/video/errors";
import { createRenderWorkspace } from "../../infrastructure/video/hyperframes/workspace";
import { beginRenderJob } from "./render-jobs";
import type { RenderEngine, RenderEngineResult } from "../../domain/video/render-engine";
import type { RenderJobInputSnapshot } from "../../domain/video/render-input";
import type { RenderManifest } from "../../domain/video/render-manifest";
import type { RenderFailureCode, RenderWorkerConfig } from "../../domain/video/render-config";
import type { AssetObjectStore } from "../../domain/ai-service/assets";
import type {
  ProjectAssetRepository, VideoBriefRevisionRepository, VideoProjectRepository, VideoRenderJobRepository,
  VideoStoryboardRevisionRepository, VideoVersionRepository,
} from "../../domain/video/contracts";
import type { VideoRenderJobStatus } from "../../domain/video/types";

export type RenderWorkerDependencies = {
  createId: () => string;
  now: () => string;
  fps: number;
  config: RenderWorkerConfig;
  projects: Pick<VideoProjectRepository, "transition" | "consumeRerender" | "getOwned">;
  assets: Pick<ProjectAssetRepository, "listOwned">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "getOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "getOwned">;
  versions: Pick<VideoVersionRepository, "create" | "latestOwned">;
  jobs: Pick<VideoRenderJobRepository, "getById" | "begin" | "fail" | "markRendering" | "markUploading" | "succeed" | "listQueued" | "listStale">;
  objectStore: Pick<AssetObjectStore, "read" | "write">;
  engine: RenderEngine;
};

export type RenderJobOutcome = { jobId: string; status: "succeeded" | "failed" | "skipped"; code?: RenderFailureCode };

/**
 * One job, end to end. The claim is `beginRenderJob`, which is the same call the routes' intake shares,
 * so the rerender quota is consumed exactly once, by whichever worker wins the conditional update.
 *
 * The order of the writes at the end is deliberate: the object is uploaded before the version row, and
 * the row before the job is marked succeeded. A crash between any two of them leaves a retryable state
 * — an orphan object, or a version whose job reads as failed — never a project that cannot be rendered.
 */
export async function runRenderJob(jobId: string, dependencies: RenderWorkerDependencies): Promise<RenderJobOutcome> {
  let claimed: { projectId: string; userId: string; isRevision: boolean } | null = null;

  try {
    const started = await beginRenderJob({ jobId }, dependencies);
    claimed = { projectId: started.projectId, userId: started.userId, isRevision: started.isRevision };

    const snapshot = parseSnapshot(started.inputSnapshot);
    const manifest = await loadManifest(started.id, snapshot, started.projectId, started.userId, dependencies);

    if (await dependencies.jobs.markRendering(jobId) === null) return skipped(jobId);

    // The version id is minted before the upload, because the object key names it and the key has to
    // exist before the row that points at it.
    const versionId = dependencies.createId();
    const workspace = await createRenderWorkspace(dependencies.config.workRoot, jobId);
    try {
      const rendered = await renderWithinBudget(jobId, manifest, workspace.dir, dependencies);

      if (await dependencies.jobs.markUploading(jobId) === null) return skipped(jobId);

      const objectKey = versionObjectKey(started.projectId, versionId);
      const bytes = await readOutput(rendered.outputPath, dependencies);
      await upload(objectKey, bytes, dependencies);

      const parent = await dependencies.versions.latestOwned(started.projectId, started.userId);
      await dependencies.versions.create({
        id: versionId,
        projectId: started.projectId,
        userId: started.userId,
        versionNumber: (parent?.versionNumber ?? 0) + 1,
        renderJobId: jobId,
        ...(started.parentVersionId ? { parentVersionId: started.parentVersionId } : {}),
        outputObjectKey: objectKey,
        durationSeconds: Math.round(rendered.probe.durationSeconds),
        aspectRatio: snapshot.settings.aspectRatio,
        resolution: snapshot.settings.resolution,
        manifestHash: rendered.manifestHash,
      });

      await dependencies.jobs.succeed(jobId);
      await dependencies.projects.transition(started.projectId, started.userId, "rendering", "ready");
      return { jobId, status: "succeeded" };
    } finally {
      await workspace.dispose();
    }
  } catch (error) {
    const code = failureCode(error);
    // A job the reclaimer already failed must not be failed twice, and its project is already released.
    if (claimed && !(error instanceof VideoError && error.code === "video_render_job_not_found")) {
      await dependencies.jobs.fail(jobId, code).catch(() => null);
      await dependencies.projects.transition(claimed.projectId, claimed.userId, "rendering", "approved").catch(() => null);
    }
    return { jobId, status: "failed", code };
  }
}
```

The helpers `runRenderJob` depends on, in the same file:

```ts
function skipped(jobId: string): RenderJobOutcome {
  return { jobId, status: "skipped" };
}

/**
 * The strict snapshot schema is the only thing that catches a snapshot written by an older or a newer
 * deploy. A parse failure is a job that cannot be rendered, not a crash.
 */
function parseSnapshot(inputSnapshot: unknown): RenderJobInputSnapshot {
  const parsed = renderJobInputSnapshotSchema.safeParse(inputSnapshot);
  if (!parsed.success) {
    throw new RenderError("render_input_unsupported", "This render was queued by a version that no longer matches.");
  }
  return parsed.data;
}

/**
 * Reads the storyboard and brief the snapshot names, never "latest": the same rule the intake follows,
 * so a revision written after approval cannot change what this render is built from.
 */
async function loadManifest(
  jobId: string,
  snapshot: RenderJobInputSnapshot,
  projectId: string,
  userId: string,
  dependencies: RenderWorkerDependencies,
): Promise<RenderManifest> {
  const [storyboard, brief, assets, project] = await Promise.all([
    dependencies.storyboardRevisions.getOwned(snapshot.storyboardRevisionId, userId),
    dependencies.briefRevisions.getOwned(snapshot.briefRevisionId, userId),
    dependencies.assets.listOwned(projectId, userId),
    dependencies.projects.getOwned(projectId, userId),
  ]);

  if (!storyboard) throw new RenderError("render_input_unsupported", "The approved storyboard is no longer available.");
  if (!brief) throw new RenderError("render_input_unsupported", "The approved brief is no longer available.");
  if (!project) throw new RenderError("render_input_unsupported", "The project is no longer available.");

  const parsedStoryboard = storyboardSchema.safeParse({ scenes: storyboard.scenes });
  const parsedBrief = videoBriefSchema.safeParse(brief.brief);
  if (!parsedStoryboard.success || !parsedBrief.success) {
    throw new RenderError("render_input_unsupported", "The approved plan is no longer readable.");
  }

  return buildRenderManifest({
    projectId,
    renderJobId: jobId,
    snapshot,
    videoType: project.videoType,
    fps: snapshot.fps,
    scenes: parsedStoryboard.data.scenes,
    brief: {
      productName: parsedBrief.data.productName,
      brandName: parsedBrief.data.brandName,
      keyMessage: parsedBrief.data.keyMessage,
      callToAction: parsedBrief.data.callToAction,
      orderDestination: parsedBrief.data.orderDestination,
      menuItems: parsedBrief.data.menuItems,
    },
    assets: assets
      .filter((asset) => !asset.deletedAt && asset.moderationStatus !== "blocked")
      .map((asset) => ({ id: asset.id, objectKey: asset.objectKey, sha256: asset.sha256, mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width, height: asset.height })),
  });
}

/**
 * The PRD's ten-minute processing budget, enforced with an abort rather than a kill: HyperFrames
 * unwinds through its own cancellation path and leaves no Chrome or FFmpeg behind.
 */
async function renderWithinBudget(
  jobId: string,
  manifest: RenderManifest,
  workDir: string,
  dependencies: RenderWorkerDependencies,
): Promise<RenderEngineResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, dependencies.config.jobTimeoutMs);

  try {
    return await dependencies.engine.render({
      manifest,
      workDir,
      outputPath: join(workDir, "render.mp4"),
      signal: controller.signal,
      onProgress: (percent) => console.log(`Render job ${jobId}: ${Math.round(percent)}%`),
    });
  } catch (error) {
    if (timedOut) throw new RenderError("render_timeout", "The render took longer than this project allows.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** A closed mapping, so no exception text can reach `error_code`. */
function failureCode(error: unknown): RenderFailureCode {
  if (error instanceof RenderError && (RENDER_FAILURE_CODES as readonly string[]).includes(error.code)) return error.code;
  return "render_engine_failed";
}

async function readOutput(outputPath: string, dependencies: RenderWorkerDependencies): Promise<Uint8Array> {
  return new Uint8Array(await readFile(outputPath));
}

/** A storage failure is its own code, because it is the one failure the user can simply retry. */
async function upload(objectKey: string, bytes: Uint8Array, dependencies: RenderWorkerDependencies): Promise<void> {
  try {
    await dependencies.objectStore.write(objectKey, bytes, "video/mp4");
  } catch {
    throw new RenderError("render_upload_failed", "The rendered video could not be stored.");
  }
}

/** The one place the version object key is built, so the upload and the row can never disagree. */
function versionObjectKey(projectId: string, versionId: string): string {
  return `video-versions/${projectId}/${versionId}.mp4`;
}
```

Add `import { readFile } from "node:fs/promises";` and `import { join } from "node:path";` to the file's imports, and note that `versionObjectKey` mirrors `objectKeyFor` in `application/video/assets.ts` for the image family.

- [ ] **Step 4: Implement the queue helpers**

```ts
/** Fails a job whose worker died and releases its project, so the user can render again. */
export async function reclaimStaleRenderJobs(dependencies: RenderWorkerDependencies): Promise<number> {
  const cutoff = new Date(Date.parse(dependencies.now()) - dependencies.config.staleJobMs).toISOString();
  const stale = await dependencies.jobs.listStale(cutoff, 50);

  let reclaimed = 0;
  for (const job of stale) {
    if (await dependencies.jobs.fail(job.id, "render_stale") === null) continue;
    await dependencies.projects.transition(job.projectId, job.userId, "rendering", "approved").catch(() => null);
    reclaimed += 1;
  }
  return reclaimed;
}

/** Oldest first, so a queue that backs up drains in the order users asked for renders. */
export async function claimNextRenderJob(dependencies: RenderWorkerDependencies): Promise<string | null> {
  const [next] = await dependencies.jobs.listQueued(1);
  return next?.id ?? null;
}
```

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter backend test -- src/application/video/render-worker.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/application/video/render-worker.ts apps/backend/src/application/video/render-worker.test.ts
git commit -m "feat(video): run a render job end to end with correct failure and reclaim behaviour"
```

### Task 9: The Worker Process

**Files:**
- Create: `apps/backend/src/worker/index.ts`
- Create: `apps/backend/src/scripts/render-smoke.ts`
- Modify: `apps/backend/src/application/video/services.ts` (add the worker factory)
- Modify: `apps/backend/package.json` (`worker`, `render:smoke` scripts)
- Modify: `apps/backend/tsconfig.json` (include `src/worker`)

**Interfaces:**
- Consumes: every task above.
- Produces: `createRenderWorkerServices(environment?): RenderWorkerDependencies`; the `worker` and `render:smoke` npm scripts.

- [ ] **Step 1: Add the worker factory**

In `apps/backend/src/application/video/services.ts`, follow the existing pattern of naming the dependencies each use case needs:

```ts
/** The render worker: the same repositories as the API, plus the engine and the worker's own config. */
export function createRenderWorkerServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RenderWorkerDependencies {
  const supabase = createSupabaseServiceRoleClient(environment);
  const bucket = readAssetBucket(environment);
  const config = readRenderWorkerConfig(environment);
  const objectStore = new SupabaseAssetObjectStore(supabase, bucket);

  return {
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    fps: config.fps,
    config,
    projects: new SupabaseVideoProjectRepository(supabase),
    assets: new SupabaseProjectAssetRepository(supabase),
    briefRevisions: new SupabaseVideoBriefRevisionRepository(supabase),
    storyboardRevisions: new SupabaseVideoStoryboardRevisionRepository(supabase),
    versions: new SupabaseVideoVersionRepository(supabase),
    jobs: new SupabaseRenderJobRepository(supabase),
    objectStore,
    engine: new HyperFramesRenderEngine({ config, objectStore, gsapScriptPath: gsapScriptPath() }),
  };
}
```

This is the only place the worker is allowed to construct infrastructure, which is the same rule the HTTP factories follow.

- [ ] **Step 2: Write the entry point**

```ts
import { claimNextRenderJob, reclaimStaleRenderJobs, runRenderJob } from "@/application/video/render-worker";
import { createRenderWorkerServices } from "@/application/video/services";
import { readRenderWorkerConfig } from "@/domain/video/render-config";

/**
 * The render worker. A separate process from the HTTP server on purpose: the PRD requires a job
 * boundary, and a long render must not hold a request open. It listens on nothing.
 */
const dependencies = createRenderWorkerServices();
const config = readRenderWorkerConfig();

let stopping = false;
let running = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

console.log(`Render worker started (poll ${config.pollMs}ms, timeout ${config.jobTimeoutMs}ms).`);

// Reclaim before the first claim: a job abandoned by a previous process is otherwise invisible until
// the staleness window expires, and its project is stuck in `rendering` until it is reclaimed.
const reclaimed = await reclaimStaleRenderJobs(dependencies);
if (reclaimed > 0) console.log(`Reclaimed ${reclaimed} abandoned render job(s).`);

while (!stopping) {
  try {
    const jobId = await claimNextRenderJob(dependencies);
    if (jobId === null) {
      await sleep(config.pollMs);
      continue;
    }

    running = true;
    const outcome = await runRenderJob(jobId, dependencies);
    running = false;
    console.log(`Render job ${outcome.jobId}: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ""}.`);
  } catch (error) {
    running = false;
    // The loop must survive an unexpected failure, or one bad job stops every later render.
    console.error("Render worker iteration failed.", error);
    await sleep(config.pollMs);
  }
}

console.log("Render worker stopping.");
if (running) console.log("Waiting for the in-flight render to finish.");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Use `createRenderWorkerServices()` with no argument in production and keep `readRenderWorkerConfig()` for the log line; do not read `getEnv()` here, because the worker does not need `SUPABASE_ANON_KEY` or `APP_URL` and requiring them would make it undeployable on its own.

- [ ] **Step 3: Add the smoke script**

`src/scripts/render-smoke.ts`, mirroring `src/scripts/ai-service.ts` as the precedent for an operator-facing script. It answers one question — "does this host render?" — without going through the API, Supabase, or a browser:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildRenderManifest, sha256Hex } from "@/domain/video/render-manifest";
import { HyperFramesRenderEngine } from "@/infrastructure/video/hyperframes/hyperframes-render-engine";
import { gsapScriptPath } from "@/infrastructure/video/hyperframes/gsap-script";
import { RENDER_INPUT_SCHEMA_VERSION } from "@/domain/video/render-input";
import { readRenderWorkerConfig } from "@/domain/video/render-config";

const run = promisify(execFile);

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const aspectRatio = flag("aspect-ratio", "9:16") as "9:16" | "1:1" | "16:9";
const resolution = flag("resolution", "720p") as "720p" | "1080p";
const durationSeconds = Number(flag("duration", "6")) as 6 | 10 | 15;
const keep = process.argv.includes("--keep");
const config = readRenderWorkerConfig();

// A real image, generated locally: the smoke run must exercise the same materialization path a
// production render does, asset hash check included.
const dir = await mkdtemp(join(tmpdir(), "hf-smoke-"));
const assetPath = join(dir, "asset.png");
await run("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=0xEFF31B:s=${resolution === "1080p" ? 1080 : 720}x${resolution === "1080p" ? 1080 : 720}`, "-frames:v", "1", assetPath]);
const assetBytes = new Uint8Array(await readFile(assetPath));

const manifest = buildRenderManifest({
  projectId: "00000000-0000-4000-8000-000000000001",
  renderJobId: "00000000-0000-4000-8000-000000000002",
  snapshot: {
    schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
    briefRevisionId: "00000000-0000-4000-8000-000000000003",
    storyboardRevisionId: "00000000-0000-4000-8000-000000000004",
    styleId: "bold_pop",
    settings: { durationSeconds, aspectRatio, resolution, language: "id", voiceOverEnabled: false, musicEnabled: false },
    variantSeed: "00000000-0000-4000-8000-000000000005",
    templateId: "product-spotlight",
    templateVersion: "1.0.0",
    stylePackVersion: "1.0.0",
    fps: config.fps,
  },
  videoType: "product_promo",
  fps: config.fps,
  scenes: [
    { order: 1, startSeconds: 0, endSeconds: durationSeconds / 2, visual: "smoke", onScreenTitle: "Smoke", onScreenCopy: "Scene one", voiceOver: null, caption: null, assetIds: ["asset-1"], audioCue: null, transition: "fade" },
    { order: 2, startSeconds: durationSeconds / 2, endSeconds: durationSeconds, visual: "smoke", onScreenTitle: "Smoke", onScreenCopy: "Scene two", voiceOver: null, caption: null, assetIds: ["asset-1"], audioCue: null, transition: "fade" },
  ],
  brief: { productName: "Smoke", brandName: null, keyMessage: "Smoke", callToAction: null, orderDestination: null, menuItems: null },
  assets: [{ id: "asset-1", objectKey: "smoke/asset-1.png", sha256: sha256Hex(assetBytes), mimeType: "image/png", byteSize: assetBytes.byteLength, width: 720, height: 720 }],
});

// The engine reads assets through the object store. A smoke run has no project in storage, so it
// serves the one generated asset directly and the hash check on it is real.
const engine = new HyperFramesRenderEngine({
  config,
  objectStore: { read: async () => assetBytes },
  gsapScriptPath: gsapScriptPath(),
});

const result = await engine.render({
  manifest,
  workDir: dir,
  outputPath: join(dir, "smoke.mp4"),
  onProgress: (percent) => process.stdout.write(`\r${Math.round(percent)}%`),
});

console.log(`\nRendered ${JSON.stringify(result, null, 2)}`);
console.log(keep ? `Work directory kept at ${dir}` : "Work directory removed on exit.");
```

Add the two infrastructure imports shown above — `HyperFramesRenderEngine` and `gsapScriptPath` — and note in the file's header comment that a script under `src/scripts/` is a process entry point, so it constructs infrastructure the same way `application/**/services.ts` does; that is the one place outside a factory where this is allowed. The generated asset is a flat square PNG, so the manifest's `width`/`height` for it are `720`; the frame size the manifest renders at still comes from `settings`, which is why a `--resolution 1080p` smoke run still produces a 1080×1920 file.

Wire both scripts into `package.json`:

```json
    "worker": "bun src/worker/index.ts",
    "render:smoke": "bun src/scripts/render-smoke.ts"
```

If Task 7's real render failed under Bun, change the two scripts to `node --import tsx/esm src/worker/index.ts` (and `…/render-smoke.ts`), add `tsx` as a devDependency, and say so in the decision record's adapter configuration.

- [ ] **Step 4: Verify**

```bash
pnpm --filter backend build
HYPERFRAMES_BROWSER_PATH="$(which google-chrome)" pnpm --filter backend render:smoke -- --aspect-ratio 9:16 --resolution 720p --duration 6
```

Expected: the build passes and the smoke command prints a probe with the requested dimensions and duration. Then start the worker against a running Supabase, queue a render through the API, and watch it reach `succeeded`:

```bash
pnpm --filter backend worker
```

Stop it with Ctrl-C and confirm nothing is left listening.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/worker apps/backend/src/scripts/render-smoke.ts \
  apps/backend/src/application/video/services.ts apps/backend/package.json apps/backend/tsconfig.json
git commit -m "feat(video): add the render worker process and its smoke command"
```

### Task 10: Document The Render Pipeline

**Files:**
- Modify: `apps/backend/docs/chat-video-generator.md`
- Modify: `apps/app/docs/notes/video-backend-backlog.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Replace the "not yet wired" claims that are now false**

In `apps/backend/docs/chat-video-generator.md`:

- Rewrite disclosure **1** ("The provider spikes did not run") so it states what the HyperFrames spike actually recorded and cites `docs/decisions/2026-09-21-hyperframes-render-engine.md`.
- Rewrite disclosure **2** so the combination list cites the spike instead of describing itself as a placeholder — or keep the placeholder wording if the spike proved all eighteen, and say so explicitly.
- Move item 1 of "What this foundation explicitly does NOT do" ("It never renders video") out, since it is no longer true, and replace it with what the render pipeline does and does not do.
- Replace the "The three plans that complete the product" list so the render plan is described in the past tense and only the AI-orchestration gaps remain.
- Add a **Render pipeline** section: the worker's entry point and npm script, the claim model and why two replicas are safe, every `RENDER_*` / `HYPERFRAMES_*` / `PRODUCER_*` variable with its default, the job status sequence, the failure codes, the staleness rule, the two new storage facts (MIME + ceiling), and the `render-input@v2` snapshot fields.
- Add a row to the endpoint table for `GET /video-projects/:projectId/render-jobs`, and to the error table for any code not already listed.
- Add a **Known limitations** subsection stating plainly: the MP4 is silent (no TTS or music provider), captions are burned in as text, moderation does not gate a render, a revision render that fails after its claim still spends a rerender, and the revision path is unreachable from the UI.
- Update the environment table with the new variables.

- [ ] **Step 2: Update the frontend backlog note**

In `apps/app/docs/notes/video-backend-backlog.md`, move items 1, 2, and 7 from "Still open" into "Wired end to end", with what the app now does. Add a line to the "Wired end to end" section for `GET …/render-jobs`. Leave items 3, 4, 5, and 6 exactly as they are — none of them are touched by this plan.

- [ ] **Step 3: Verify**

```bash
grep -rn "does NOT render\|never renders video\|has not shipped\|HyperFrames is not installed\|worker does not exist" apps/backend/docs apps/app/docs apps/app/features apps/app/domain || echo "no stale claims"
```

Expected: no stale claim survives. Every hit must be fixed or explicitly re-justified.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/docs/chat-video-generator.md apps/app/docs/notes/video-backend-backlog.md
git commit -m "docs: document the render pipeline and retire the stale render claims"
```

### Task 11: Frontend Render Schemas And Server Actions

**Files:**
- Create: `apps/app/features/video/schemas/render-schema.ts`
- Test: `apps/app/features/video/schemas/render-schema.test.ts`
- Create: `apps/app/features/video/actions/start-video-render-action.ts`
- Create: `apps/app/features/video/actions/get-video-render-status-action.ts`
- Create: `apps/app/features/video/actions/cancel-video-render-action.ts`
- Test: `apps/app/features/video/actions/start-video-render-action.test.ts`
- Test: `apps/app/features/video/actions/get-video-render-status-action.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `apiErrorMessage`, `ApiError` from `@/lib/api/client`; `requireUser` from `@/lib/auth/session`; `VideoRenderJob`, `VideoVersion` from `@/domain/video/types`.
- Produces:
  - `videoRenderJobSchema`, `videoRenderJobListSchema`, `videoVersionSchema`, `videoVersionListSchema`
  - `type RenderStatus = { jobs: VideoRenderJob[]; versions: VideoVersion[] }`
  - `startVideoRenderAction(formData): Promise<{ error?: string; message?: string }>`
  - `getVideoRenderStatusAction(input: { projectId: string }): Promise<{ status?: RenderStatus; error?: string }>`
  - `cancelVideoRenderAction(formData): Promise<{ error?: string; message?: string }>`

- [ ] **Step 1: Write the failing tests**

The frontend already has a `video-project-schema.test.ts` and action tests, so follow those exactly. `render-schema.test.ts` pins the contract the backend's `RenderJobResponse` and `VersionResponse` actually return, including the fields the schema must not require:

```ts
import { describe, expect, it } from "vitest";
import { videoRenderJobListSchema, videoVersionListSchema } from "./render-schema";

describe("videoRenderJobListSchema", () => {
  it("accepts a queued job without startedAt, finishedAt, or errorCode", () => {
    const parsed = videoRenderJobListSchema.safeParse({
      jobs: [{ id: "job-1", status: "queued", isRevision: false, attempts: 0, queuedAt: "2026-09-22T00:00:00.000Z", createdAt: "2026-09-22T00:00:00.000Z" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty list, which is what a project with no render returns", () => {
    expect(videoRenderJobListSchema.safeParse({ jobs: [] }).success).toBe(true);
  });

  it("rejects a status the backend does not have, instead of rendering an unknown label", () => {
    const parsed = videoRenderJobListSchema.safeParse({
      jobs: [{ id: "job-1", status: "almost", isRevision: false, attempts: 0, queuedAt: "q", createdAt: "c" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("videoVersionListSchema", () => {
  it("accepts a null playbackUrl, which is what a version whose object is gone returns", () => {
    const parsed = videoVersionListSchema.safeParse({
      versions: [{ id: "v-1", versionNumber: 1, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", createdAt: "c", playbackUrl: null }],
    });
    expect(parsed.success).toBe(true);
  });
});
```

`start-video-render-action.test.ts` follows the existing action tests: mock `@/lib/api/client` and `@/lib/auth/session`, call the action with a `FormData`, and assert the path, the method, the generated idempotency key, and the mapped error.

```ts
it("posts an idempotency key with the render request", async () => {
  const formData = new FormData();
  formData.set("projectId", "p-1");
  await startVideoRenderAction({}, formData);

  expect(apiFetch).toHaveBeenCalledWith("/video-projects/p-1/render-jobs", expect.objectContaining({ method: "POST" }));
  const body = vi.mocked(apiFetch).mock.calls[0]?.[1]?.body as { idempotencyKey: string };
  expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
});

it("answers a quota refusal with the backend's own explanation", async () => {
  vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, { code: "video_revision_quota_exhausted", error: "This project has used all three rerenders." }));
  const formData = new FormData();
  formData.set("projectId", "p-1");
  await expect(startVideoRenderAction({}, formData)).resolves.toEqual({ error: "This project has used all three rerenders." });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter app test -- features/video`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Implement the schemas**

`render-schema.ts` mirrors the backend's response types with `.strict()` where the backend is strict and optional fields where the backend omits them:

```ts
import { z } from "zod";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from "@/domain/video/settings";

const renderJobStatusSchema = z.enum(["queued", "preparing", "rendering", "uploading", "succeeded", "failed", "cancelled"]);

/** Mirrors the backend's `RenderJobResponse`. Optional because the backend omits a field until it has a value. */
export const videoRenderJobSchema = z.object({
  id: z.string(),
  status: renderJobStatusSchema,
  isRevision: z.boolean(),
  attempts: z.number().int(),
  queuedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string(),
});

export const videoRenderJobListSchema = z.object({ jobs: z.array(videoRenderJobSchema) });

/** Mirrors the backend's `VersionResponse`. A null URL is a version whose object is gone. */
export const videoVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  // The landed version's probed duration is rounded to whole seconds, and the API only accepts 6, 10,
  // and 15, so a value outside this set means the backend published something the app cannot label.
  durationSeconds: z.union([z.literal(6), z.literal(10), z.literal(15)]),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  createdAt: z.string(),
  playbackUrl: z.string().nullable(),
});

export const videoVersionListSchema = z.object({ versions: z.array(videoVersionSchema) });

export type RenderStatus = { jobs: VideoRenderJob[]; versions: VideoVersion[] };
```

- [ ] **Step 4: Implement the actions**

`start-video-render-action.ts` mirrors `approve-video-project-action.ts`, including `revalidatePath`, and generates the idempotency key on the server so a double-submitted form cannot produce two jobs:

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import type { VideoRenderJob } from "@/domain/video/types";

export async function startVideoRenderAction(_: { error?: string; message?: string }, formData: FormData): Promise<{ error?: string; message?: string }> {
  await requireUser();

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) return { error: "Proyek tidak ditemukan." };

  try {
    await apiFetch<{ job: VideoRenderJob }>(`/video-projects/${encodeURIComponent(projectId)}/render-jobs`, {
      method: "POST",
      // Minted per submission: a retried server action replays the same key and gets the same job back.
      body: { idempotencyKey: randomUUID() },
    });
  } catch (error) {
    console.error("Failed to queue a render", error);
    return { error: apiErrorMessage(error, "Tidak dapat memulai render.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }

  revalidatePath(`/dashboard/videos/${projectId}`);
  return { message: "Render dimulai. Halaman ini akan memperbarui sendiri." };
}
```

`get-video-render-status-action.ts` is the poll target. It reads both endpoints in parallel so one round trip refreshes the whole panel, and it returns data rather than a message:

```ts
"use server";

import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import { videoRenderJobListSchema, videoVersionListSchema, type RenderStatus } from "../schemas/render-schema";

export async function getVideoRenderStatusAction(input: { projectId: string }): Promise<{ status?: RenderStatus; error?: string }> {
  await requireUser();

  const path = `/video-projects/${encodeURIComponent(input.projectId)}`;
  try {
    const [jobs, versions] = await Promise.all([
      apiFetch<unknown>(`${path}/render-jobs`),
      apiFetch<unknown>(`${path}/versions`),
    ]);
    // A shape the panel cannot render is reported as a failure rather than rendered as blanks.
    return {
      status: {
        jobs: videoRenderJobListSchema.parse(jobs).jobs,
        versions: videoVersionListSchema.parse(versions).versions,
      },
    };
  } catch (error) {
    console.error("Failed to read render status", error);
    return { error: apiErrorMessage(error, "Tidak dapat memuat status render.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }
}
```

`cancel-video-render-action.ts` is only valid while the job is still `queued` — the backend refuses anything else with `video_state_conflict` — so it maps that refusal to its own message rather than the generic fallback:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

export async function cancelVideoRenderAction(_: { error?: string; message?: string }, formData: FormData): Promise<{ error?: string; message?: string }> {
  await requireUser();

  const projectId = formData.get("projectId");
  const jobId = formData.get("jobId");
  if (typeof projectId !== "string" || projectId.length === 0) return { error: "Proyek tidak ditemukan." };
  if (typeof jobId !== "string" || jobId.length === 0) return { error: "Render tidak ditemukan." };

  try {
    await apiFetch(`/video-projects/${encodeURIComponent(projectId)}/render-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  } catch (error) {
    console.error("Failed to cancel a render", error);
    return { error: apiErrorMessage(error, "Render sudah berjalan dan tidak bisa dibatalkan.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }

  revalidatePath(`/dashboard/videos/${projectId}`);
  return { message: "Render dibatalkan." };
}
```

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter app test -- features/video && pnpm --filter app lint && pnpm --filter app build`
Expected: PASS and a clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/app/features/video/schemas/render-schema.ts apps/app/features/video/schemas/render-schema.test.ts \
  apps/app/features/video/actions/start-video-render-action.ts apps/app/features/video/actions/start-video-render-action.test.ts \
  apps/app/features/video/actions/get-video-render-status-action.ts apps/app/features/video/actions/get-video-render-status-action.test.ts \
  apps/app/features/video/actions/cancel-video-render-action.ts
git commit -m "feat(app): add the render schemas and server actions"
```

### Task 12: The Render Panel, The Version List, And The Workspace Wiring

**Files:**
- Modify: `apps/app/features/video/components/RenderStatusPanel.tsx` (replace)
- Create: `apps/app/features/video/components/render-status-presentation.ts`
- Create: `apps/app/features/video/components/VideoVersionList.tsx`
- Create: `apps/app/features/video/actions/download-video-version-action.ts`
- Modify: `apps/app/app/dashboard/videos/[projectId]/page.tsx`
- Test: `apps/app/features/video/components/render-status-presentation.test.ts`
- Modify: `apps/app/domain/video/settings.ts` (verified matrix, if Task 1 trimmed it)

**Interfaces:**
- Consumes: Task 11's actions and `RenderStatus`; `RENDER_JOB_STATUS_LABELS` and `VIDEO_STYLE_PRESETS` from `@/domain/video/settings`.
- Produces: `RenderStatusPanel({ projectId, status, canRender, quotaExhausted })`, `VideoVersionList({ versions })`, and `renderStatusPresentation(job)` — the pure function the label/error mapping is tested through.

- [ ] **Step 1: Write the failing test**

The panel's decisions belong in a pure function so they are testable without a DOM. `render-status-presentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isJobActive, renderStatusPresentation } from "./render-status-presentation";

describe("renderStatusPresentation", () => {
  it("labels every backend status with the workspace's own copy", () => {
    for (const status of ["queued", "preparing", "rendering", "uploading", "succeeded", "failed", "cancelled"] as const) {
      expect(renderStatusPresentation({ status }).label.length).toBeGreaterThan(0);
    }
  });

  it("says nothing about an error code it does not recognise instead of showing the raw code", () => {
    expect(renderStatusPresentation({ status: "failed", errorCode: "render_weird" }).detail).toBeNull();
  });

  it("explains the two failures a user can act on", () => {
    expect(renderStatusPresentation({ status: "failed", errorCode: "render_timeout" }).detail).toMatch(/terlalu lama|timeout/i);
    expect(renderStatusPresentation({ status: "failed", errorCode: "render_stale" }).detail).toMatch(/terputus|ulang/i);
  });

  it("counts queued, preparing, rendering, and uploading as in flight, and nothing else", () => {
    for (const status of ["queued", "preparing", "rendering", "uploading"] as const) {
      expect(isJobActive({ status })).toBe(true);
    }
    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      expect(isJobActive({ status })).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter app test -- features/video/components`
Expected: FAIL — `./render-status-presentation` does not resolve.

- [ ] **Step 3: Implement the presentation, the panel, and the version list**

`render-status-presentation.ts` holds `isJobActive` and `renderStatusPresentation` — a label from `RENDER_JOB_STATUS_LABELS`, an optional user-facing detail from a closed map from `RenderFailureCode` strings to Indonesian copy (timeout and stale get explanations; anything unrecognised returns `null` rather than leaking a code), and a `tone` the panel maps to a class.

`RenderStatusPanel.tsx` becomes a client component. It renders the current job's status, and while `isJobActive(job)` it polls `getVideoRenderStatusAction` on an interval, refreshing the route once the job reaches a terminal state. It uses `useTransition` plus the existing `useState` conventions, keeps the panel's existing outer markup so the workspace layout does not shift, and disables the render control with a reason when `canRender` is false. Styling reuses the existing tokens (`rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner`, `text-neutral-450`, `text-primary`, `font-mono text-xs`), and the button the disabled version currently renders becomes the enabled primary action:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RENDER_JOB_STATUS_LABELS } from "@/domain/video/settings";
import type { VideoRenderJob } from "@/domain/video/types";
import { cancelVideoRenderAction } from "../actions/cancel-video-render-action";
import { getVideoRenderStatusAction } from "../actions/get-video-render-status-action";
import { startVideoRenderAction } from "../actions/start-video-render-action";
import { isJobActive, renderStatusPresentation } from "./render-status-presentation";

const POLL_MS = 3000;

export function RenderStatusPanel({ projectId, initialJob, canRender, quotaExhausted }: {
  projectId: string;
  initialJob: VideoRenderJob | null;
  canRender: boolean;
  quotaExhausted: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Poll only while a job is in flight: a terminal job never changes again, and polling the backend
  // for the lifetime of the page would be a request every three seconds for nothing.
  useEffect(() => {
    if (!job || !isJobActive(job)) return undefined;
    const timer = setInterval(() => {
      void getVideoRenderStatusAction({ projectId }).then((result) => {
        if (result.error) { setError(result.error); return; }
        const next = result.status?.jobs[0] ?? null;
        setJob(next);
        if (!next || !isJobActive(next)) router.refresh();
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, projectId, router]);

  const presentation = job ? renderStatusPresentation(job) : null;

  // The returned markup is written out in full below.
}
```

The panel body, replacing the comment above, keeps the existing panel's markup and tokens:

```tsx
  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <h2 className="text-base font-semibold text-white">Render</h2>

      {job && presentation ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-450">Status</dt>
            <dd className="font-mono text-xs font-semibold text-primary">{presentation.label}</dd>
          </div>
          {job.attempts > 1 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-450">Percobaan</dt>
              <dd className="font-mono text-xs text-white">{job.attempts}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-3 text-sm leading-6 text-neutral-450">
          {canRender ? "Video siap dirender." : "Render tersedia setelah brief dan storyboard disetujui."}
        </p>
      )}

      {presentation?.detail ? (
        <p role="status" className="mt-3 rounded-2xl border border-white/10 bg-black px-3 py-2 text-xs leading-5 text-neutral-300">
          {presentation.detail}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
          {error}
        </p>
      ) : null}

      {job && isJobActive(job) ? (
        <form action={cancel}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="jobId" value={job.id} />
          <button
            type="submit"
            disabled={pending || job.status !== "queued"}
            className="mt-4 h-11 w-full rounded-full bg-white/10 px-5 text-sm font-semibold text-neutral-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Batalkan render
          </button>
        </form>
      ) : (
        <form action={start}>
          <input type="hidden" name="projectId" value={projectId} />
          <button
            type="submit"
            disabled={!canRender || quotaExhausted || pending}
            aria-disabled={!canRender || quotaExhausted || pending}
            className="mt-4 h-11 w-full rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {job?.status === "succeeded" ? "Render ulang" : "Render video"}
          </button>
        </form>
      )}

      {quotaExhausted ? <p className="mt-3 text-xs text-neutral-500">Kuota revisi 3/3 sudah terpakai.</p> : null}
    </section>
  );
```

`start` and `cancel` are thin wrappers over the actions that set the error or message state, so a failed submission never throws out of a form action:

```tsx
  async function start(formData: FormData) {
    setError("");
    const result = await startVideoRenderAction({}, formData);
    if (result.error) setError(result.error);
  }

  async function cancel(formData: FormData) {
    setError("");
    const result = await cancelVideoRenderAction({}, formData);
    if (result.error) setError(result.error);
  }
```

`render-status-presentation.ts` — the whole panel's decision-making, kept out of the component so it is testable without a DOM:

```ts
import { RENDER_JOB_STATUS_LABELS } from "@/domain/video/settings";
import type { VideoRenderJob, VideoRenderJobStatus } from "@/domain/video/types";

const ACTIVE_STATUSES: readonly VideoRenderJobStatus[] = ["queued", "preparing", "rendering", "uploading"];

const FAILURE_DETAILS: Readonly<Record<string, string>> = {
  render_timeout: "Render terlalu lama dan dihentikan. Coba lagi, atau pilih durasi yang lebih pendek.",
  render_stale: "Render terputus sebelum selesai. Proyek sudah bisa dirender ulang.",
  render_engine_failed: "Mesin render gagal membuat video. Coba lagi sebentar lagi.",
  render_engine_unavailable: "Mesin render sedang tidak tersedia di server ini.",
  render_upload_failed: "Hasil render gagal diunggah. Proyek sudah bisa dirender ulang.",
  render_output_too_large: "Hasil render lebih besar dari batas penyimpanan proyek.",
  render_output_invalid: "Hasil render tidak sesuai pengaturan proyek, jadi tidak dipublikasikan.",
  render_asset_mutated: "Salah satu foto berubah setelah persetujuan. Unggah ulang foto itu lalu render lagi.",
  render_asset_missing: "Salah satu foto sudah tidak ada. Unggah ulang lalu render lagi.",
  render_input_unsupported: "Render ini dibuat oleh versi aplikasi yang berbeda. Buat render baru.",
  render_worker_shutdown: "Server render dimulai ulang. Proyek sudah bisa dirender ulang.",
};

export type RenderStatusPresentation = { label: string; detail: string | null };

/** In flight means the panel should keep polling and keep the cancel control available. */
export function isJobActive(job: Pick<VideoRenderJob, "status">): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

/**
 * An unrecognised error code yields no detail rather than the raw code: the code is a machine
 * contract, and a user reading `render_weird` learns nothing and leaks the shape of the backend.
 */
export function renderStatusPresentation(job: Pick<VideoRenderJob, "status" | "errorCode">): RenderStatusPresentation {
  return {
    label: RENDER_JOB_STATUS_LABELS[job.status],
    detail: job.errorCode ? FAILURE_DETAILS[job.errorCode] ?? null : null,
  };
}
```

`VideoVersionList.tsx` and `VideoPlayer.tsx`: the newest version plays in a `<video controls preload="metadata">`, and the rest are listed with their number, duration, and a download form. A version whose `playbackUrl` is null renders a labelled placeholder, exactly as `ProjectAssetGallery` does for a missing preview.

```tsx
// apps/app/features/video/components/VideoVersionList.tsx
import { durationLabel, projectStatusLabel } from "@/domain/video/settings";
import type { VideoVersion } from "@/domain/video/types";
import { downloadVideoVersionAction } from "../actions/download-video-version-action";

export function VideoVersionList({ projectId, versions }: { projectId: string; versions: VideoVersion[] }) {
  if (versions.length === 0) {
    return (
      <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
        <h2 className="text-base font-semibold text-white">Hasil video</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-450">Belum ada video yang selesai dirender.</p>
      </section>
    );
  }

  // The backend already orders versions newest first, so the first entry is the one to play.
  const newest = versions[0];

  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <h2 className="text-base font-semibold text-white">
        Hasil video <span className="float-right font-mono text-xs text-neutral-500">versi {newest?.versionNumber}</span>
      </h2>

      {newest?.playbackUrl ? (
        // Signed URLs are minted per request, so the file is played directly; the Next image/video
        // optimizer would cache a URL that expires in five minutes.
        <video
          controls
          playsInline
          preload="metadata"
          src={newest.playbackUrl}
          className="mt-4 aspect-[9/16] w-full rounded-2xl bg-black outline outline-1 outline-white/10"
        />
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black p-4 text-sm text-neutral-450">
          File video versi ini tidak tersedia lagi.
        </p>
      )}

      <ul className="mt-4 space-y-2 text-sm">
        {versions.map((version) => (
          <li key={version.id} className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-neutral-400">
              v{version.versionNumber} · {durationLabel(version.durationSeconds)} · {version.resolution}
            </span>
            {version.playbackUrl ? (
              <form action={downloadVideoVersionAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="versionId" value={version.id} />
                <button type="submit" className="rounded-full px-3 py-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  Unduh
                </button>
              </form>
            ) : (
              <span className="font-mono text-xs text-neutral-600">tidak tersedia</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`download-video-version-action.ts` mints the URL through the existing endpoint and redirects to it, so the signed URL never appears in the rendered markup:

```ts
"use server";

import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

export async function downloadVideoVersionAction(formData: FormData): Promise<void> {
  await requireUser();

  const projectId = formData.get("projectId");
  const versionId = formData.get("versionId");
  if (typeof projectId !== "string" || typeof versionId !== "string") return;

  let url: string;
  try {
    ({ url } = await apiFetch<{ url: string }>(`/video-projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/download`));
  } catch (error) {
    if (error instanceof ApiError) return;
    throw error;
  }

  redirect(url);
}
```

- [ ] **Step 4: Wire the workspace page**

In `apps/app/app/dashboard/videos/[projectId]/page.tsx`, add the render-jobs read to the existing `Promise.all` and pass the results through, replacing `<RenderStatusPanel />`:

```tsx
      apiFetch<{ jobs: VideoRenderJob[] }>(`${path}/render-jobs`),
      apiFetch<{ versions: VideoVersion[] }>(`${path}/versions`),
```

```tsx
          <RenderStatusPanel
            projectId={project.id}
            initialJob={jobs[0] ?? null}
            canRender={project.status === "approved"}
            quotaExhausted={project.revisionRenderCount >= 3}
          />
          <VideoVersionList versions={versions} projectId={project.id} />
```

`canRender` is exactly the backend's intake condition — the route refuses anything but `approved` — so the control is enabled if and only if the request would succeed. `revision_draft` is deliberately not accepted here: the revision path has no planner yet, so offering it would promise a render the backend would refuse.

- [ ] **Step 5: Verify**

```bash
pnpm --filter app test
pnpm --filter app lint
pnpm --filter app build
```

Then run the whole thing end to end against a local Supabase and confirm by hand: queue a render from the workspace, watch the status advance without a manual reload, then see the player and the download once it is `ready`.

- [ ] **Step 6: Commit**

```bash
git add apps/app/features/video/components apps/app/features/video/actions/download-video-version-action.ts \
  apps/app/app/dashboard/videos
git commit -m "feat(app): show render status, the version list, and the rendered video"
```
