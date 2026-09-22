# Video backend backlog (frontend view)

The chat-video frontend in `apps/app` is built against the API in `apps/backend`. This note tracks
what the PRD needs that the API still cannot do, so nothing is quietly faked in the UI.

Backend reference: `apps/backend/docs/chat-video-generator.md`.
PRD: `docs/prd/chat-based-ai-video-generator-mvp.md`.

## Wired end to end

- `POST/GET/DELETE /video-projects`
- `POST/GET/DELETE /video-projects/:projectId/assets`
- `POST/GET /video-projects/:projectId/messages` — the turn stores the user's message, runs the
  interviewer, stores the assistant reply with its controls, and, once the brief is complete, plans
  the storyboard and moves the project to `awaiting_approval`
- `GET /video-projects/:projectId/brief` and `GET /video-projects/:projectId/storyboard`
- `POST /video-projects/:projectId/approve`
- `POST/GET/cancel /video-projects/:projectId/render-jobs`, `GET …/versions`, `…/versions/:id/download`

All of it goes through `lib/api/client.ts` (`apiFetch`, `apiUpload`) with the Supabase bearer token.

## Closed in the orchestration pass

1. **Brief reads.** `GET …/brief` returns the latest revision (draft or complete) or `null`.
2. **Storyboard reads.** `GET …/storyboard` returns the latest revision or `null`.
3. **Assistant replies.** The interviewer runs the `interviewer` task through the AI service and
   stores the question plus its `controls` on the assistant message. The workspace renders single
   select, multi select, the recommended option with its reason, and free text.
4. **Approval.** Once the draft is complete and the project has at least one asset, the planner runs
   the `planner` task, the storyboard is normalized to the exact duration, and the project opens for
   approval. Approval then freezes the snapshot the render will use.

Two details worth knowing about how it behaves:

- The user's message is stored before the model is called, so a provider failure leaves the message
  in the transcript and the app shows the AI error. The typed text stays in the composer for a retry.
- A complete brief with no uploaded asset does not plan anything; the assistant asks for a photo,
  because a storyboard has to reference a real asset.

## Still open

| # | Missing | What the app does today |
|---|---|---|
| 1 | Render worker and MP4. `POST …/render-jobs` queues a row that nothing claims, because HyperFrames is not installed. | The render control is disabled with the reason. No job is ever queued, so a project cannot be stranded in `rendering`. |
| 2 | No `video_versions` row exists, so `GET …/versions` is always empty and download answers 404. | No version list or player is rendered. |
| 3 | Moderation provider. `moderation_status` stays `pending`. | Asset tiles read "Menunggu moderasi". The interview is not gated on it. |
| 4 | Vision and multi-image analysis. `createAIService` resolves `ai_assets`, not `video_project_assets`, so the interviewer never sees the images. | The image count is passed to the prompt; the product facts come from the user. |
| 5 | `revision_planner`, so PRD Story 6 (revise after a render) has no path. | A project in `rendering`, `ready`, `approved`, or a blocked state refuses new interview turns with `video_state_conflict`. |
| 6 | No project thumbnail. | Library tiles derive their background from the style preset swatch. |
| 7 | `RENDER_SUPPORTED_COMBINATIONS` is an unverified placeholder; the HyperFrames spike never ran. | The setup screen offers the 18 combinations the API accepts. |

When the render plan lands, replace `RenderStatusPanel` with the real job status, version list,
player, and download; nothing else in the workspace needs to change.
