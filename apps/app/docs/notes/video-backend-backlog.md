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
- `GET /video-projects/:projectId/render-jobs`: the newest job for the project as a one-item list, or
  `{ "jobs": [] }` when it has never been rendered. The workspace uses it to restore the render panel
  after a reload, because the page holds no job id.
- The render pipeline itself: a separate worker process claims a `queued` row, renders it with
  HyperFrames, verifies the encoded file with FFprobe, uploads the MP4 to the shared private bucket,
  and records the `video_versions` row. So a queued job really finishes, `GET …/versions` really has
  rows, and the download really works.

All of it goes through `lib/api/client.ts` (`apiFetch`, `apiUpload`) with the Supabase bearer token.

The workspace renders the job's status, polls it while it is in flight, plays the newest version, and
downloads any version whose URL is still mintable. Neither the job status nor the version URL is
faked: a project with no render shows the empty state, and a version whose object is gone shows a
labelled placeholder instead of a broken player.

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
| 3 | Moderation provider. `moderation_status` stays `pending`. | Asset tiles read "Menunggu moderasi". The interview is not gated on it. A render ignores it too: the worker renders `pending` and `allowed` assets and refuses only `blocked`. |
| 4 | Vision and multi-image analysis. `createAIService` resolves `ai_assets`, not `video_project_assets`, so the interviewer never sees the images. | The image count is passed to the prompt; the product facts come from the user. |
| 5 | `revision_planner`, so PRD Story 6 (revise after a render) has no path. | A project in `rendering`, `ready`, `approved`, or a blocked state refuses new interview turns with `video_state_conflict`. The render panel therefore offers a render only from `approved`, which is exactly the backend's intake condition. |
| 6 | No project thumbnail. | Library tiles derive their background from the style preset swatch. The rendered MP4 is not used as a preview image. |

Two consequences of the render plan that are worth knowing here:

- **The MP4 is silent.** No TTS or music provider is wired, so there is no audio to play or mute, and
  `voiceOverEnabled` shows up as burned-in caption text rather than sound.
- **A failed revision render still spends a rerender.** The backend consumes one of the three the
  moment the worker claims the job, and there is no refund. The panel shows the failure and the
  project is renderable again, but the quota does not come back.
