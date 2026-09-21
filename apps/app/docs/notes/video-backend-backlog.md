# Video backend backlog (frontend view)

The chat-video frontend in `apps/app` is built against the API that exists today in `apps/backend`.
Several pieces the PRD needs are not implemented server-side yet. Where they are missing, the
frontend must not pretend they exist. This note lists each gap, the stand-in that covers it, and
what replaces it.

Backend reference: `apps/backend/docs/chat-video-generator.md`.
PRD: `docs/prd/chat-based-ai-video-generator-mvp.md`.

## What the frontend talks to for real

- `POST/GET/DELETE /video-projects`
- `POST/GET/DELETE /video-projects/:projectId/assets`
- `POST/GET /video-projects/:projectId/messages`
- `POST /video-projects/:projectId/approve`
- `POST/GET /video-projects/:projectId/render-jobs`, `POST …/cancel`
- `GET /video-projects/:projectId/versions`, `GET …/versions/:versionId/download`

All of these are wired through `lib/api/client.ts` (`apiFetch`, `apiUpload`) and authenticated with
the Supabase bearer token.

## Gaps, stand-ins, and swaps

| # | Missing capability | Frontend stand-in | Swap when it ships |
|---|---|---|---|
| 1 | `GET` for brief revisions. `saveBriefRevision` is an internal use case with no route. | The workspace shows a "Menunggu backend" panel instead of a brief summary. | Add the read endpoint, then render the brief in the workspace panel. |
| 2 | `GET` for storyboard revisions. Same reason as #1. | Same "Menunggu backend" panel. | Add the read endpoint, then render the storyboard timeline and gate the render button on it. |
| 3 | Assistant chat replies and structured questions. A turn stores only the user message; `controls` is always `null`. | Phase 2 renders the user's own messages from the real endpoint and shows a clearly-labelled pending state for the assistant side. No fake assistant bubble is persisted. | The AI-orchestration plan adds the assistant reply and `controls` inside `POST …/messages`. |
| 4 | `POST …/approve` needs a brief and a storyboard row, so it always answers `409 video_approval_incomplete` today. | Phase 2's approval panel calls the real endpoint outside mock mode and surfaces the `video_approval_incomplete` message; in mock mode it simulates the snapshot behind `NEXT_PUBLIC_VIDEO_MOCK`. | Once #1 and #2 exist, approval succeeds and the simulated path is deleted. |
| 5 | No render worker, so `POST …/render-jobs` can never queue: it needs an approved storyboard. | Phase 3 shows the real job status when one exists and a mock progression behind `NEXT_PUBLIC_VIDEO_MOCK`. | The render plan adds the worker and MP4 upload. |
| 6 | No MP4 ever exists, so `GET …/versions` is always empty and download 404s. | Phase 3 renders a mock version list; playback uses `NEXT_PUBLIC_VIDEO_MOCK_SRC` when set, otherwise a poster with a "Mode demo" note. | The worker writes `video_versions`; playback and download then work unchanged. |
| 7 | No moderation provider. `video_project_assets.moderation_status` stays `pending`. | `ProjectAssetGallery` and the uploader label assets "Menunggu moderasi". | A moderation provider sets `allowed`/`blocked`; the labels already cover those values. |
| 8 | No project thumbnail. | Library cards derive the tile background from the chosen style preset's swatch. | If a thumbnail field is added, use it instead of the gradient. |
| 9 | `RENDER_SUPPORTED_COMBINATIONS` is an unverified placeholder; the HyperFrames spike never ran, so all 18 combinations are "supported". | The setup screen offers exactly the 18 combinations the API accepts. | Prune the backend list after the spike and mirror it in `isRenderCombinationSupported`. |

## Flag

`NEXT_PUBLIC_VIDEO_MOCK` (default `"1"`) turns the Phase 2/3 stand-ins on or off. Set it to `"0"`
in any environment where the AI-orchestration and render plans have shipped, so no mocked data can
reach a user. `NEXT_PUBLIC_VIDEO_MOCK_SRC` optionally points at a demo clip for the mock player.
