# Video Generator Frontend-Only Migration

Date: 2026-09-22

## Goal

Remove the video generator's Next.js backend layer from `apps/app`. The browser will call `apps/backend` directly with the current Supabase access token. `apps/backend` remains responsible for authorization, validation, persistence, object storage, AI orchestration, render jobs, and downloads.

This migration covers `/dashboard/videos`, `/dashboard/videos/new`, and `/dashboard/videos/[projectId]`.

## Scope

The migration includes:

- Browser-side authenticated API requests to `NEXT_PUBLIC_API_URL`.
- Client-side loading for the project library and project workspace.
- Direct browser mutations for project creation, asset upload and deletion, chat, approval, render start and cancellation, project deletion, and version download.
- Browser-side render polling.
- Removal of video Server Actions and their imports.
- A follow-up cleanup decision for video-specific Server Action upload limits after an import scan.
- A follow-up cleanup decision for the unused service-role Supabase client after an import scan.

The migration does not move authentication callback, logout, or the dashboard navigation guard. Those routes manage the browser's Supabase session and do not own video data or business logic.

## Boundaries

### `apps/app`

`apps/app` owns:

- Pages and components.
- Supabase browser session access.
- Form and response validation for immediate UI feedback.
- Loading, empty, unauthorized, not-found, and retry states.
- Browser polling and navigation after successful mutations.

It must not own:

- Video Server Actions.
- Server-side video API requests.
- Supabase service-role access.
- Database, object storage, AI, render, quota, or project state logic.

### `apps/backend`

`apps/backend` remains authoritative for:

- Bearer-token authentication and resource ownership.
- Request validation and stable response shapes.
- Projects, assets, messages, briefs, storyboards, render jobs, and versions.
- State transitions, idempotency, quotas, cancellation, and signed URLs.

No backend route is duplicated in Next.js.

## Browser API Client

Create a browser-only API client under `apps/app/lib/api`. It will:

1. Read the current session from the existing Supabase browser client.
2. Require a non-empty access token before dispatch.
3. Resolve paths against `NEXT_PUBLIC_API_URL`.
4. Send `Authorization: Bearer <access token>`.
5. Serialize JSON requests and send raw asset bytes without wrapping them in JSON.
6. Parse successful JSON responses and support empty `204` responses.
7. Throw a typed error containing only the status and parsed safe payload.
8. Accept an `AbortSignal` for navigation, reload, mutation, polling, and upload cancellation.
9. Never log tokens, request bodies, uploaded bytes, signed URLs, or backend response bodies.

The client exposes separate JSON and upload functions so content types cannot drift. Components use one shared error-message mapper for known backend errors and a local fallback for network failures.

The client reads the current Supabase session immediately before each request, so it uses a token refreshed by Supabase. It does not retry a `401`: the UI shows `Sesi berakhir. Masuk lagi untuk melanjutkan.` and links to `/login`. A `403` shows `Kamu tidak memiliki akses ke proyek ini.` without disclosing whether another user's resource exists.

Backend errors use the existing `{ error: string }` shape. UI handling is explicit: `404` renders not found, `409` asks the user to reload current project state, `413` reports the 10 MB upload limit, `422` shows the safe backend validation message, and `429` asks the user to wait and retry. Unknown statuses use an action-specific fallback.

## Data Loading

### Project library

`app/dashboard/videos/page.tsx` remains a small route component that renders a client container. The container requests `GET /video-projects`, then renders the existing `VideoProjectLibrary`.

States:

- Loading skeleton or existing dark panel placeholder.
- Empty project list through the existing library UI.
- Unauthorized session with a login action.
- Request failure with a retry action.

### Project workspace

`app/dashboard/videos/[projectId]/page.tsx` passes the route parameter to a client workspace container. The container loads project, assets, messages, brief, storyboard, render jobs, and versions concurrently from the existing backend endpoints.

The container owns the shared workspace state. A mutation that returns one changed resource updates that resource. Chat and approval affect several resources, so they reload all workspace endpoints after success instead of reconstructing backend state locally.

Every load has an `AbortController`. A project change, a newer reload, or unmount aborts the prior load. The container also records a request generation and applies results only when they belong to the latest generation, preventing stale responses from replacing newer state.

A backend `404` renders a not-found state within the workspace route. Other failures retain the route and show a retry action.

## Mutations

Replace each video Server Action with a browser function:

| Current action | Browser request |
| --- | --- |
| Create project | `POST /video-projects` |
| Upload asset | `POST /video-projects/:projectId/assets` with raw bytes |
| Delete asset | `DELETE /video-projects/:projectId/assets/:assetId` |
| Send message | `POST /video-projects/:projectId/messages` |
| Approve project | `POST /video-projects/:projectId/approve` |
| Start render | `POST /video-projects/:projectId/render-jobs` |
| Cancel render | `POST /video-projects/:projectId/render-jobs/:jobId/cancel` |
| Poll render | `GET /video-projects/:projectId/render-jobs` and `/versions` |
| Download version | `GET /video-projects/:projectId/versions/:versionId/download` |
| Delete project | `DELETE /video-projects/:projectId` |

The upload request follows the existing backend contract exactly: `Content-Type` is the selected file's `image/jpeg`, `image/png`, or `image/webp` type; `X-Asset-Rights-Confirmed: true` confirms rights; and the body contains the file bytes. No filename is sent or persisted. The 10 MB frontend check is advisory; `apps/backend` validates MIME type, declared length, decoded bytes, dimensions, and ownership. The backend CORS allowlist must add `X-Asset-Rights-Confirmed`. Navigation or unmount aborts an active upload. Because the backend persists only after reading and validating the complete body, an interrupted request must not create an asset row or object; backend route tests will prove this behavior.

Project creation preserves the current sequence: create the project, upload selected assets one at a time, then navigate to the workspace. If an upload fails after project creation, the UI names the selected file that failed and links to the created workspace. It does not delete the project automatically.

The existing create endpoint has no idempotency field. This migration will add `idempotencyKey` to `POST /video-projects`, backed by a uniqueness guarantee scoped to the authenticated user. The setup form generates one key per deliberate submission and reuses it when retrying a timed-out create request. The backend returns the original project for a repeated key.

Render creation continues to send a fresh idempotency key for each deliberate start attempt. Re-renders caused by React state changes must not dispatch another request.

## Component Changes

The existing `VideoProjectLibrary`, `VideoSetupForm`, `VideoChat`, `VideoApprovalPanel`, `ProjectAssetGallery`, `RenderStatusPanel`, and `VideoVersionList` retain their current rendered structure and classes except for the new loading, login, retry, and partial-upload states. Components that import Server Actions receive async callback props or call typed browser API functions through their owning client container.

The workspace container coordinates cross-panel refreshes. Child components continue to own local pending state for buttons and forms. The migration must preserve the current layout, terminology, and dark visual system; it does not redesign the video generator.

Copy changes are limited to loading, retry, unauthorized, and partial-upload states. They use plain Indonesian, name the failed action, and give the next step. Focused snapshots will detect unintended markup or class changes in the listed components.

## Polling

`RenderStatusPanel` keeps the current three-second interval while a job is active. Each poll:

- Uses the authenticated browser API client.
- Stops when the job reaches a terminal state, the component unmounts, or the project changes.
- Prevents overlapping requests.
- Waits for both job and version responses, then applies both in one state update.
- Shows a recoverable status error without clearing the last known job state.

If either response fails, neither result is applied. Polling continues after one three-second interval for network errors and retryable `5xx` responses. It stops for `401`, `403`, or `404`. The panel never starts a new poll while the previous poll is active. Cancellation or unmount aborts the in-flight pair and suppresses its result.

No Server Action participates in polling.

## CORS And Configuration

The browser origin must be allowed by the existing backend CORS plugin. Local development permits `http://localhost:3000` to call the configured backend origin, normally `http://localhost:4000`.

`NEXT_PUBLIC_API_URL` remains public browser configuration and must contain the backend API root. Backend CORS configuration will allow `Authorization`, `Content-Type`, and `X-Asset-Rights-Confirmed`. Tests cover the allowed app origin, rejected origins, missing origins, preflight for each allowed header and method, and rejection of unsupported headers.

## Backend Route Readiness

Before changing a frontend consumer, tests must lock down its backend route:

| Route group | Existing response | Required migration work |
| --- | --- | --- |
| Project list/detail/delete | JSON project data or deletion result, ownership checked | Add create idempotency only |
| Project create | `201 { project }`, strict validated JSON | Accept user-scoped `idempotencyKey`; return `200` with the existing project on replay |
| Messages, brief, storyboard, approval | JSON resources, ownership checked | No contract change |
| Assets | Raw bytes in; JSON asset/list/delete response; ownership checked | Add CORS header and interrupted-upload test |
| Render jobs | JSON job responses; create already uses idempotency | No contract change |
| Versions | JSON version list; ownership checked | No list contract change |
| Version download | Authenticated endpoint returns `{ url: string }` | Keep this response shape and test URL ownership/expiry behavior |

The browser calls the authenticated version-download endpoint with a Bearer token, reads `{ url }`, validates it as an `https:` URL (or an explicitly allowed loopback URL in tests), and then assigns `window.location.href`. The Supabase token never appears in the URL. The browser does not fetch the video into memory.

## Deletions And Cleanup

After all consumers are migrated:

- Delete `apps/app/features/video/actions/**`.
- Replace or delete the server-only `apps/app/lib/api/client.ts`; keep a distinct server client only if another non-video feature still imports it.
- Remove video action tests and replace them with browser client/component tests.
- Remove `apps/app/infrastructure/supabase/service-role-client.ts` and its test when the repository-wide import scan confirms they are unused.
- Record removal of the `serverActions.bodySizeLimit` and experimental proxy limit as a separate cleanup after an import scan proves no remaining Server Action upload depends on them.

Auth callback, logout, `proxy.ts`, and cookie-backed Supabase server clients remain because they support application authentication outside the video data path.

## Testing

### Browser API client

Use Vitest to verify:

- URL resolution against `NEXT_PUBLIC_API_URL`.
- Bearer token forwarding.
- Missing-session rejection before fetch.
- JSON request and response handling.
- Raw upload headers and bytes.
- `204`, malformed JSON, backend errors, and network failures.
- Credential isolation and absence of tokens, payloads, bytes, and signed URLs in logs or thrown errors.

### Components and flows

Cover:

- Library loading, empty, error, retry, and success states.
- Workspace concurrent loading, `404`, retry, and success states.
- Project creation followed by sequential uploads and navigation.
- Partial upload failure after project creation.
- Chat, approval, asset deletion, render start, cancellation, and download.
- Polling start, atomic state update, partial failure, retry, terminal stop, unmount cleanup, and no overlapping requests.
- Navigation and newer reloads abort stale workspace requests.
- Upload cancellation leaves no asset record or object.

Add a mandatory integration test that starts the backend test app, sends browser-shaped CORS preflight and Bearer-authenticated requests from `http://localhost:3000`, and proves the upload headers and response are accepted. Playwright covers the UI flow with mocked network contracts if an authenticated Supabase fixture is unavailable. Unit tests must not require live Supabase or paid services.

Backend negative tests cover disallowed and missing origins, unsupported preflight headers, missing/malformed/expired Bearer tokens, cross-user project/asset/render/download access, upload size and MIME rejection, malicious metadata, and absence of tokens or signed URLs in logs and errors.

### Verification

Run:

- Focused `apps/app` API and video tests.
- Full `apps/app` tests, lint, and build.
- Backend CORS and video route tests when changed.
- Source searches proving no video Server Action or server-side video fetch remains.
- `graphify update .` after source changes.

## Acceptance Criteria

- Browser requests for the video generator go directly to `apps/backend`.
- No file under `apps/app/features/video/actions` remains.
- Video pages do not import the server-only API client or fetch video data in server components.
- No service-role Supabase client remains in `apps/app` unless a documented, active non-video consumer requires it.
- Create, upload, chat, approval, render, cancel, polling, download, asset deletion, and project deletion use backend endpoints with Bearer authentication.
- Existing backend ownership and authorization checks remain authoritative.
- The UI preserves its current visual language and gives users a retry or login action for recoverable failures.
- Snapshot tests and a desktop/mobile checklist confirm the listed video components keep their existing structure, classes, and responsive layout except for approved state UI.
- Relevant app and backend tests, lint, and builds pass.

## Risks

- Direct browser requests expose CORS gaps that server-side requests did not encounter. Tests and local configuration must prove the allowed origin and headers.
- Moving initial reads to the browser adds a loading state after navigation. The client containers must prevent blank layouts and duplicate requests.
- Supabase session refresh can race with a request. The API client reads the current session for each request rather than caching a token.
- Large uploads now travel directly from the browser. Backend byte limits remain authoritative, while the frontend keeps the current size check for immediate feedback.
- Several mutations affect multiple workspace resources. Reloading authoritative backend state is safer than reproducing transition logic in the frontend.
