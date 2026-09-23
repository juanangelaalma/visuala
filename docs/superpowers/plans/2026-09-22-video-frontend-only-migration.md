# Video Generator Frontend-Only Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser call `apps/backend` directly for every video-generator read and mutation, with no video Server Actions or server-side video fetches in `apps/app`.

**Architecture:** Complete and test missing backend contracts first: project-create idempotency, upload CORS, upload cancellation safety, and ownership checks. Then add one browser-only authenticated API client, move the library and workspace to client containers, migrate mutations and polling, and delete the video Server Actions. Keep auth callback/logout/navigation guards in Next.js because they manage the browser session rather than video data.

**Tech Stack:** TypeScript 5, Next.js 16.2.9, React 19.2.4, Supabase JS/SSR, Elysia, Zod 4.4.3, Vitest 3.2.4, Playwright, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-09-22-video-frontend-only-migration-design.md`

## Global Constraints

- Read the relevant installed Next.js documentation under `node_modules/next/dist/docs/` before changing pages or client/server boundaries.
- Use pnpm only.
- Follow strict red-green-refactor TDD for production changes.
- The browser sends the current Supabase access token as `Authorization: Bearer <token>`; tokens never enter URLs, logs, errors, or persisted data.
- `apps/backend` remains authoritative for auth, ownership, validation, persistence, storage, AI, state transitions, quotas, render jobs, cancellation, and signed URLs.
- No video Server Action, Next.js video route handler, or server-side video fetch may remain in `apps/app`.
- Uploads use raw JPEG/PNG/WebP bytes, the matching `Content-Type`, and `X-Asset-Rights-Confirmed: true`; backend validation remains mandatory.
- Preserve the current video-generator layout, components, classes, terminology, and responsive behavior except for loading, retry, login, not-found, and partial-upload states.
- Apply antislop rules during UI and copy changes: plain Indonesian, no decorative copy, name the failed action and the next step.
- Do not add a client data-fetching dependency; use React state/effects and the shared browser API client.
- Do not edit tracked or untracked `.env` files; update examples only when required.
- Do not commit unless the user explicitly authorizes commits; commit steps below are conditional.
- Run `graphify update .` after source changes.

## File Structure

### Backend

- Create `apps/backend/src/application/video/create-video-project.ts`: idempotent project creation use case, split from unrelated project reads/deletion.
- Modify `apps/backend/src/domain/video/contracts.ts`: add project idempotency input and lookup contract.
- Modify `apps/backend/src/domain/video/types.ts`: carry the project idempotency snapshot only if the domain model needs it; do not expose it in API responses.
- Modify `apps/backend/src/infrastructure/video/supabase-video-project-repository.ts`: persist and lookup user-scoped idempotency keys.
- Add a timestamped migration under `apps/backend/supabase/migrations/`: add `idempotency_key` and unique `(user_id, idempotency_key)` constraint/index.
- Modify `packages/db`: regenerate or minimally update shared row types for the schema change.
- Modify `apps/backend/src/schemas/video.ts`, `routes/video.ts`, and tests: accept the key and return `201` on first creation, `200` on replay.
- Modify `apps/backend/src/plugins/cors.ts` and tests: allow the upload rights header and prove browser-shaped preflight behavior.
- Modify backend video route/application tests: lock down upload interruption, cross-user access, signed download response, and sensitive logging.

### Frontend

- Create `apps/app/infrastructure/supabase/browser-client.ts`: singleton browser Supabase client.
- Create `apps/app/lib/api/browser-client.ts`: authenticated JSON/upload browser transport with typed safe errors and cancellation.
- Create `apps/app/features/video/api/video-api.ts`: endpoint-specific typed functions only; no UI state.
- Create `apps/app/features/video/components/VideoProjectLibraryContainer.tsx`: library loading/error/retry state.
- Create `apps/app/features/video/components/VideoWorkspace.tsx`: workspace loading, shared state, reload generation, and mutation callbacks.
- Modify `VideoSetupForm.tsx`, `VideoChat.tsx`, `VideoApprovalPanel.tsx`, `ProjectAssetGallery.tsx`, `RenderStatusPanel.tsx`, and `VideoVersionList.tsx`: replace Server Action usage with async browser callbacks/API functions.
- Modify the three video pages so they only pass route data and render client containers.
- Delete `apps/app/features/video/actions/**` after all consumers move.
- Keep `apps/app/lib/api/client.ts` only for active non-video server consumers; remove video assumptions and debug logging.
- Remove service-role client and action upload limits only after repository-wide scans prove they are unused.

---

### Task 1: Lock Down Backend Browser Contracts

**Files:**
- Modify: `apps/backend/src/plugins/cors.ts`
- Modify: `apps/backend/src/plugins/cors.test.ts`
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`
- Modify: `apps/backend/src/plugins/supabase.test.ts`
- Modify: `apps/backend/src/application/video/assets.test.ts`

**Interfaces:**
- Consumes: existing Elysia CORS/auth plugins and video routes.
- Produces: browser-compatible preflight behavior and regression coverage for all existing route contracts.

- [ ] **Step 1: Write failing CORS tests**

Add tests that send `OPTIONS /video-projects/:id/assets` with origin `http://localhost:3000`, method `POST`, and requested headers `authorization,content-type,x-asset-rights-confirmed`. Assert `204`, the exact allowed origin, and an allow-headers value containing all three headers. Add rejected-origin and unsupported-header cases.

- [ ] **Step 2: Run CORS tests to verify RED**

Run:

```bash
pnpm --filter backend test -- src/plugins/cors.test.ts
```

Expected: the rights header case fails because `X-Asset-Rights-Confirmed` is absent from `allowedHeaders`.

- [ ] **Step 3: Allow the upload rights header**

Change the CORS plugin header list to:

```ts
allowedHeaders: ["Content-Type", "Authorization", "X-Asset-Rights-Confirmed", "X-Callback-Token"],
```

Keep the existing origin predicate and methods.

- [ ] **Step 4: Add failing backend security contract tests**

In route/auth tests, cover missing/malformed Bearer tokens, another user's project/asset/render/version as `404`, raw upload MIME/size/rights rejection, signed download `{ url }`, and no token or signed URL in logged errors. Add a test proving message content is not logged.

- [ ] **Step 5: Remove the debug message log and satisfy contract tests**

Delete `console.log("SINI", parsed.data)` from `routes/video.ts`. Make only the smallest route/error changes required by the new tests; preserve owner-scoped not-found behavior.

- [ ] **Step 6: Add interrupted-upload coverage**

Test `registerProjectAsset` with an object-store write failure and assert no asset repository row is created; if the repository write occurs after storage, assert the uploaded object is deleted on a later repository failure. The route must not report success for an aborted or incomplete body.

- [ ] **Step 7: Verify backend contracts**

```bash
pnpm --filter backend test -- src/plugins/cors.test.ts src/plugins/supabase.test.ts src/routes/video.test.ts src/application/video/assets.test.ts
pnpm --filter backend lint
```

- [ ] **Step 8: Commit if authorized**

```bash
git add apps/backend/src/plugins/cors.ts apps/backend/src/plugins/cors.test.ts apps/backend/src/plugins/supabase.test.ts apps/backend/src/routes/video.ts apps/backend/src/routes/video.test.ts apps/backend/src/application/video/assets.test.ts
git commit -m "test(backend): lock video browser contracts"
```

### Task 2: Add Idempotent Project Creation

**Files:**
- Create: `apps/backend/src/application/video/create-video-project.ts`
- Create: `apps/backend/src/application/video/create-video-project.test.ts`
- Create: `apps/backend/supabase/migrations/<timestamp>_add_video_project_idempotency.sql`
- Modify: `apps/backend/src/domain/video/contracts.ts`
- Modify: `apps/backend/src/infrastructure/video/supabase-video-project-repository.ts`
- Modify: `apps/backend/src/infrastructure/video/supabase-video-project-repository.test.ts`
- Modify: `apps/backend/src/infrastructure/video/video-migrations.test.ts`
- Modify: `apps/backend/src/schemas/video.ts`
- Modify: `apps/backend/src/schemas/video.test.ts`
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`
- Modify: `packages/db/src/database.types.ts` or the actual generated database-type entry point found in the package

**Interfaces:**
- Consumes: authenticated `user.id`, project repository, project create body.
- Produces: `createVideoProject(command, dependencies): Promise<{ project: VideoProject; created: boolean }>` and repository `findByIdempotencyKey(userId, key)`.

- [ ] **Step 1: Write failing use-case tests**

Cover first creation, replay returning the existing project without `create`, same key for a different user creating a separate project, blank/non-UUID key rejection, and validation before persistence.

- [ ] **Step 2: Verify use-case RED**

```bash
pnpm --filter backend test -- src/application/video/create-video-project.test.ts
```

Expected: module or repository contract is missing.

- [ ] **Step 3: Implement the use case and repository contract**

Use this command/result shape:

```ts
export type CreateVideoProjectCommand = {
  userId: string;
  idempotencyKey: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  settings: VideoOutputSettings;
};

export async function createVideoProject(
  command: CreateVideoProjectCommand,
  dependencies: CreateProjectDependencies,
): Promise<{ project: VideoProject; created: boolean }>;
```

Lookup by `(userId, idempotencyKey)` before creating. On a unique-conflict race, repeat the lookup and return the winner.

- [ ] **Step 4: Add migration and generated row type**

Add nullable `idempotency_key uuid`, backfill is unnecessary for historical rows, then add a partial unique index for non-null values:

```sql
create unique index video_projects_user_id_idempotency_key_key
  on public.video_projects (user_id, idempotency_key)
  where idempotency_key is not null;
```

Update `@visuala/db` row/insert/update types.

- [ ] **Step 5: Add repository RED/GREEN tests**

Assert insert maps `idempotency_key`, lookup filters both `user_id` and key, and snake_case never leaks from the repository.

- [ ] **Step 6: Update schema and route tests first**

Require `idempotencyKey: z.string().uuid()` in project creation. Assert `201` on first create, `200` on replay, strict rejection of extra fields, and no key in the response.

- [ ] **Step 7: Implement route status behavior**

Set status from the use-case result:

```ts
const { project, created } = await createVideoProject(...);
set.status = created ? 201 : 200;
return { project: toProjectResponse(project) };
```

- [ ] **Step 8: Verify project creation**

```bash
pnpm --filter backend test -- src/application/video/create-video-project.test.ts src/infrastructure/video/supabase-video-project-repository.test.ts src/infrastructure/video/video-migrations.test.ts src/schemas/video.test.ts src/routes/video.test.ts
pnpm --filter backend lint
```

- [ ] **Step 9: Commit if authorized**

```bash
git add apps/backend packages/db
git commit -m "feat(backend): make video project creation idempotent"
```

### Task 3: Build the Authenticated Browser API Layer

**Files:**
- Create: `apps/app/infrastructure/supabase/browser-client.ts`
- Create: `apps/app/infrastructure/supabase/browser-client.test.ts`
- Create: `apps/app/lib/api/browser-client.ts`
- Create: `apps/app/lib/api/browser-client.test.ts`
- Create: `apps/app/features/video/api/video-api.ts`
- Create: `apps/app/features/video/api/video-api.test.ts`
- Read before changes: `node_modules/next/dist/docs/` client component and environment-variable guides

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, browser Supabase session.
- Produces: `browserApiFetch<T>()`, `browserApiUpload<T>()`, `BrowserApiError`, `browserApiErrorMessage()`, and typed `videoApi` functions.

- [ ] **Step 1: Write failing browser-client tests**

Cover a cached browser Supabase client created with `createBrowserClient<Database>()` and public environment values only.

- [ ] **Step 2: Write failing transport tests**

Cover URL resolution, current token read for every request, missing-session rejection before fetch, Bearer header, JSON body, raw bytes and rights header, `204`, malformed success JSON, safe backend errors, network failures, abort propagation, and no sensitive logging.

- [ ] **Step 3: Run tests to verify RED**

```bash
pnpm --filter app test -- infrastructure/supabase/browser-client.test.ts lib/api/browser-client.test.ts
```

- [ ] **Step 4: Implement the browser transport**

Use browser-only modules and this options shape:

```ts
type BrowserApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};
```

Reject missing sessions with a typed `BrowserApiError(401, { error: "Unauthorized." })`. Parse JSON once. Treat `204` as `undefined`. Never use `server-only`, cookies, or the server Supabase client.

- [ ] **Step 5: Write endpoint wrapper tests**

Test exact method/path/body for every route in the spec. Project creation must accept a caller-supplied UUID idempotency key. Download must validate the returned URL protocol without placing the access token in it.

- [ ] **Step 6: Implement `video-api.ts`**

Keep endpoint mapping here and UI state elsewhere. Export one function per operation, plus `loadVideoWorkspace(projectId, signal)` using `Promise.all` for the seven reads.

- [ ] **Step 7: Verify API layer**

```bash
pnpm --filter app test -- infrastructure/supabase/browser-client.test.ts lib/api/browser-client.test.ts features/video/api/video-api.test.ts
pnpm --filter app lint
```

- [ ] **Step 8: Commit if authorized**

```bash
git add apps/app/infrastructure/supabase/browser-client.ts apps/app/infrastructure/supabase/browser-client.test.ts apps/app/lib/api/browser-client.ts apps/app/lib/api/browser-client.test.ts apps/app/features/video/api
git commit -m "feat(app): add authenticated browser video API"
```

### Task 4: Move Project Library And Setup Flow To The Browser

**Files:**
- Create: `apps/app/features/video/components/VideoProjectLibraryContainer.tsx`
- Create: `apps/app/features/video/components/VideoProjectLibraryContainer.test.tsx`
- Modify: `apps/app/app/dashboard/videos/page.tsx`
- Modify: `apps/app/features/video/components/VideoSetupForm.tsx`
- Create: `apps/app/features/video/components/VideoSetupForm.test.tsx`
- Modify: `apps/app/app/dashboard/videos/new/page.tsx`

**Interfaces:**
- Consumes: Task 3 `videoApi.listProjects`, `createProject`, and `uploadAsset`.
- Produces: client-only library loading and create/upload/navigation flow.

- [ ] **Step 1: Write failing library state tests**

Test loading, success, empty, `401` login action, generic failure, retry, and abort-on-unmount. Assert the existing library receives unchanged project data.

- [ ] **Step 2: Implement the library container and thin page**

Make `page.tsx` render only metadata-compatible route markup and `<VideoProjectLibraryContainer />`; remove `apiFetch` and `requireUser` from this page.

- [ ] **Step 3: Write failing setup-flow tests**

Test form validation, one idempotency key per submission, key reuse after an ambiguous create failure, sequential upload, navigation after all uploads, partial upload failure naming the file and linking to the created workspace, and cancellation on unmount.

- [ ] **Step 4: Replace Server Action calls in `VideoSetupForm`**

Call `videoApi.createProject` and `videoApi.uploadAsset` directly. Preserve form structure/classes. Add only the approved pending, login, retry, and partial-upload copy.

- [ ] **Step 5: Verify library and setup**

```bash
pnpm --filter app test -- features/video/components/VideoProjectLibraryContainer.test.tsx features/video/components/VideoSetupForm.test.tsx
pnpm --filter app lint
```

- [ ] **Step 6: Commit if authorized**

```bash
git add apps/app/app/dashboard/videos apps/app/features/video/components/VideoProjectLibraryContainer* apps/app/features/video/components/VideoSetupForm*
git commit -m "refactor(app): move video setup reads and writes to browser"
```

### Task 5: Move The Workspace And Mutations To The Browser

**Files:**
- Create: `apps/app/features/video/components/VideoWorkspace.tsx`
- Create: `apps/app/features/video/components/VideoWorkspace.test.tsx`
- Modify: `apps/app/app/dashboard/videos/[projectId]/page.tsx`
- Modify: `apps/app/features/video/components/VideoChat.tsx`
- Modify: `apps/app/features/video/components/VideoApprovalPanel.tsx`
- Modify: `apps/app/features/video/components/ProjectAssetGallery.tsx`
- Modify: `apps/app/features/video/components/VideoVersionList.tsx`
- Add or modify focused component tests for each changed interaction

**Interfaces:**
- Consumes: Task 3 workspace loader and mutation functions.
- Produces: one shared client workspace state and callback props for mutations.

- [ ] **Step 1: Write failing workspace loading tests**

Cover concurrent success, loading shell, `404`, `401`, retry, project-id change, stale response suppression, and abort-on-unmount.

- [ ] **Step 2: Implement shared workspace state**

Move the existing page markup into `VideoWorkspace`. Keep the route page responsible only for awaiting `params` and passing `projectId`. Use one generation counter plus `AbortController` per load.

- [ ] **Step 3: Write failing mutation tests**

Cover chat full reload, approval full reload, asset deletion state update, project deletion navigation, and signed download navigation. Assert the download uses a separately fetched signed URL and never appends a token.

- [ ] **Step 4: Replace action imports with callbacks/API calls**

Keep pending state in each component. The workspace supplies reload/update callbacks; no component imports `features/video/actions`.

- [ ] **Step 5: Add structure/style regression assertions**

Snapshot the stable markup/class names for `VideoChat`, `VideoApprovalPanel`, `ProjectAssetGallery`, and `VideoVersionList`, allowing only state UI additions.

- [ ] **Step 6: Verify workspace**

```bash
pnpm --filter app test -- features/video/components/VideoWorkspace.test.tsx features/video/components/VideoChat.test.tsx features/video/components/VideoApprovalPanel.test.tsx features/video/components/ProjectAssetGallery.test.tsx features/video/components/VideoVersionList.test.tsx
pnpm --filter app lint
```

- [ ] **Step 7: Commit if authorized**

```bash
git add apps/app/app/dashboard/videos/[projectId] apps/app/features/video/components
git commit -m "refactor(app): move video workspace to browser API"
```

### Task 6: Move Render Control And Polling To The Browser

**Files:**
- Modify: `apps/app/features/video/components/RenderStatusPanel.tsx`
- Modify: `apps/app/features/video/components/render-status-presentation.ts`
- Create or modify: `apps/app/features/video/components/RenderStatusPanel.test.tsx`
- Modify: `apps/app/features/video/schemas/render-schema.ts`
- Modify: `apps/app/features/video/schemas/render-schema.test.ts`

**Interfaces:**
- Consumes: `videoApi.startRender`, `cancelRender`, and `getRenderStatus`.
- Produces: direct browser mutations and non-overlapping three-second polling.

- [ ] **Step 1: Write failing polling tests with fake timers**

Cover immediate state, active-job polling, one in-flight request maximum, atomic jobs/versions update, partial failure applying neither, retry after three seconds for network/5xx, stop on terminal/401/403/404, project change, cancellation, and unmount abort.

- [ ] **Step 2: Write failing render mutation tests**

Assert a fresh UUID per deliberate start click, no duplicate dispatch from rerender, cancellation response update, and recoverable error copy.

- [ ] **Step 3: Implement direct render API usage**

Remove all render action imports. Keep presentation helpers pure. Use one interval lifecycle and one in-flight `AbortController`.

- [ ] **Step 4: Verify render behavior**

```bash
pnpm --filter app test -- features/video/components/RenderStatusPanel.test.tsx features/video/components/render-status-presentation.test.ts features/video/schemas/render-schema.test.ts
pnpm --filter app lint
```

- [ ] **Step 5: Commit if authorized**

```bash
git add apps/app/features/video/components/RenderStatusPanel* apps/app/features/video/components/render-status-presentation* apps/app/features/video/schemas/render-schema*
git commit -m "refactor(app): poll video renders from browser"
```

### Task 7: Remove Video Full-Stack Code And Validate Boundaries

**Files:**
- Delete: `apps/app/features/video/actions/**`
- Modify or retain: `apps/app/lib/api/client.ts` and tests based on non-video consumers
- Delete if unused: `apps/app/infrastructure/supabase/service-role-client.ts` and its tests
- Modify if unused: `apps/app/next.config.ts`
- Modify: any imports found by the required scans

**Interfaces:**
- Consumes: completed browser migration.
- Produces: an `apps/app` video feature with no Server Actions or server-side backend calls.

- [ ] **Step 1: Prove action imports are gone**

Run:

```bash
rg -n "features/video/actions|Action\(" apps/app/app/dashboard/videos apps/app/features/video
rg -n '"use server"' apps/app/features/video
```

Expected: no matches. Fix consumers before deleting files if any remain.

- [ ] **Step 2: Delete video actions and obsolete tests**

Delete all source/tests under `apps/app/features/video/actions`. Their behavior is now covered by API and component tests.

- [ ] **Step 3: Audit shared server infrastructure**

Run:

```bash
rg -n "@/lib/api/client|service-role-client|createSupabaseServiceRoleClient" apps/app --glob '!**/.next/**'
rg -n "FormData|File" apps/app/features --glob '**/actions/*.ts'
```

If `service-role-client` has no production consumer, delete it and its test. If no remaining action accepts file uploads, remove both 12 MB limits from `next.config.ts`. Keep the server API client if billing/auth or another active feature uses it, but remove the debug `console.log(payload)`.

- [ ] **Step 4: Add a boundary regression test**

Add a source-boundary test under `apps/app/features/video` that fails when a video source file imports `server-only`, `@/lib/api/client`, `@/infrastructure/supabase/server-client`, or contains `"use server"`.

- [ ] **Step 5: Run app verification**

```bash
pnpm --filter app test
pnpm app:lint
pnpm app:build
```

- [ ] **Step 6: Run backend verification**

```bash
pnpm --filter backend test -- src/plugins/cors.test.ts src/plugins/supabase.test.ts src/routes/video.test.ts src/application/video src/infrastructure/video
pnpm backend:build
pnpm --filter backend lint
```

- [ ] **Step 7: Run final source and secret checks**

```bash
rg -n '"use server"|@/lib/api/client|server-only|createSupabaseServerClient' apps/app/app/dashboard/videos apps/app/features/video
rg -n "SUPABASE_SERVICE_ROLE_KEY|service-role-client" apps/app --glob '!**/.next/**'
git diff --check
git status --short
```

Expected: no forbidden video matches, no frontend service-role implementation, no whitespace errors, and no `.env` file in the migration diff.

- [ ] **Step 8: Update graph**

```bash
graphify update .
```

- [ ] **Step 9: Manual responsive checklist**

At desktop and mobile widths, verify project list, setup, workspace load/retry, chat, approval, assets, render status, versions, partial upload, login state, and not-found state. Compare existing component structure and classes; record only approved state-UI differences.

- [ ] **Step 10: Commit if authorized**

```bash
git add apps/app apps/backend packages/db graphify-out docs/superpowers/specs/2026-09-22-video-frontend-only-migration-design.md docs/superpowers/plans/2026-09-22-video-frontend-only-migration.md
git commit -m "refactor: move video generator backend calls to browser"
```

## Live Status

- No live Supabase or paid AI call is required by this plan.
- Browser integration uses fixture auth/backend processes in tests.
- Manual local verification may use `http://localhost:3000` and `http://localhost:4000` only after the operator starts both services with non-production credentials.
