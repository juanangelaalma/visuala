# Video Chat Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start video chat with a persisted AI question and show each submitted answer immediately.

**Architecture:** A backend use case initializes the conversation on demand, idempotently storing the AI's question. The browser workspace requests the opener for empty chats. The chat component maintains a temporary outgoing bubble until the API acknowledges it, while the workspace keeps other panels refreshed separately.

**Tech Stack:** Elysia, TypeScript, Supabase repository interfaces, Next.js client components, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-video-chat-opening-design.md`

## Global Constraints

- Preserve existing unstaged work in backend conversation, interviewer, prompts and brief files.
- Do not introduce another lockfile or direct database access in client components.
- Each option click submits a single option, including multi-select questions.
- Do not create a second opening message on refresh or concurrent requests.

---

### Task 1: Idempotent assistant opening on backend

**Files:**
- Create: `apps/backend/src/application/video/open-interview.ts`
- Create: `apps/backend/src/application/video/open-interview.test.ts`
- Modify: `apps/backend/src/routes/video.ts`
- Modify: `apps/backend/src/routes/video.test.ts`

**Interfaces:**
- Consumes: `runInterviewer`, `createVideoConversationServices`, `toMessageResponse`, `VideoMessageRepository`.
- Produces: `openVideoInterview({ userId, projectId }, dependencies): Promise<VideoMessage[]>`; `POST /video-projects/:projectId/messages/opening` returns `{ messages: MessageResponse[] }`.

- [ ] Write backend use-case tests for owned empty draft, existing transcript, AI failure, and competing opening inserts. Build repository mocks following `conversation.test.ts`.
- [ ] Run `pnpm --filter backend test -- open-interview.test.ts` and confirm failures for absent use case.
- [ ] Implement owner-scoped read, interviewer call with empty transcript and null draft, validated turn, second transcript read, and append assistant using project UUID as the stable opening ID; on unique-key conflict return the winning transcript. Reject invalid AI turns with `AIError` safe message. Add route and route tests for auth and response shape.
- [ ] Run focused backend tests until passing; ensure initial assistant controls survive `toMessageResponse`.

### Task 2: Browser initialization and retained workspace state

**Files:**
- Modify: `apps/app/features/video/api/video-api.ts`
- Modify: `apps/app/features/video/components/VideoWorkspace.tsx`
- Modify: `apps/app/features/video/components/VideoWorkspace.test.tsx`

**Interfaces:**
- Consumes: `POST /video-projects/:projectId/messages/opening` and existing message response.
- Produces: `videoApi.openInterview(projectId, signal?)`; workspace passes persisted opening to `VideoChat` and handles retry.

- [ ] Test fresh empty project opens with assistant question, repeat load keeps one question, and failed opening exposes a retry.
- [ ] Run focused workspace test and confirm red.
- [ ] Add browser API method and workspace initialization effect guarded against stale requests; only open empty, interviewable projects. Preserve loaded workspace while refreshing after a chat turn; use the returned message/reply immediately.
- [ ] Run focused workspace tests and confirm green.

### Task 3: Immediate outgoing bubble and choice submission

**Files:**
- Modify: `apps/app/features/video/components/VideoChat.tsx`
- Modify: `apps/app/features/video/components/VideoChat.test.tsx`

**Interfaces:**
- Consumes: `VideoMessage[]`, `onSend(content): Promise<{ message: VideoMessage; reply: VideoMessage }>`.
- Produces: immediate temporary user bubble, hidden controls while pending, reconciled reply bubbles, recovery after rejection.

- [ ] Test free-text optimistic bubble before promise resolution, option-click immediate submit and disappearance (single/multi), API success reconciliation, and failed send recovery.
- [ ] Run focused chat tests and confirm red.
- [ ] Implement local pending message, pending-state option hiding, direct option submit and draft restoration on failure. Keep prior conversation visible and avoid duplicate messages after workspace refresh.
- [ ] Run focused chat tests and confirm green.

### Task 4: Validate and synchronize

**Files:** `apps/backend/src/application/video/open-interview.ts`, `apps/app/features/video/components/VideoChat.tsx` and associated tests.

- [ ] Read the installed Next.js client-component guide in `node_modules/next/dist/docs/` before editing frontend code.
- [ ] Run focused Vitest suites for the changed backend and frontend packages and relevant lint/type checks with pnpm.
- [ ] Run `graphify update .` and inspect `git diff --check` and `git status --short` for unintended changes.
