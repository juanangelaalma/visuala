# Creative Video Foundation Handoff

## Resume Instruction

Continue the approved implementation using `superpowers:subagent-driven-development` from the first incomplete task in:

`docs/superpowers/plans/2026-09-14-creative-video-foundation-plan.md`

Read these first:

- Binding spec: `docs/superpowers/specs/2026-09-14-creative-video-fnb-mvp-design.md`
- Active plan: `docs/superpowers/plans/2026-09-14-creative-video-foundation-plan.md`
- SDD ledger: `.superpowers/sdd/2026-09-14-creative-video-foundation-plan/progress.md`
- Task 7 brief: `.superpowers/sdd/2026-09-14-creative-video-foundation-plan/task-7-brief.md`
- Task 7 report: `.superpowers/sdd/2026-09-14-creative-video-foundation-plan/task-7-report.md`

Do not redispatch Tasks 1-6. Resume Task 7 at fix round 1, then complete Task 8 and the foundation-wide review without pausing between tasks.

## User Decisions

- Work directly in the current dirty checkout; no isolated worktree is required.
- Do not commit unless the user explicitly authorizes commits.
- Preserve all unrelated dirty changes, especially `apps/scraper/**`.
- Use `CategoryPlugin`, not the former `VerticalPlugin` terminology.
- Keep `BriefSnapshot` as a distinct model.
- Plugins are build-time registered and resolved by exact category/style version.
- Beta exports are free; credit reservation/debit is deferred.
- Do not run paid/live AI calls without explicit permission.

## Completed Tasks

### Task 1

- Creative-video domain contracts, errors, types, and state machine.
- Retry mapping: `analysis -> analyzing`, `planning|compilation -> building_preview`, `rendering -> rendering`.
- Review approved.

### Task 2

- Exact-version plugin registry.
- Explicit `fnb@1` category and `editorial@1` style registration.
- Review approved.

### Task 3

- Owner-scoped Supabase projects, messages, briefs, and concepts.
- RLS, ownership constraints, composite foreign keys, CAS revisions, and atomic RPCs.
- Disposable PostgreSQL integration harness.
- Review approved.

### Task 4

- Validated one-image project creation and server action.
- Database-enforced owner/create-key idempotency.
- Safe asset race cleanup and user-safe errors.
- Review approved.

### Task 5

- F&B interviewer schema and deterministic protected-fact extraction.
- Protected price, discount, WhatsApp, and promotion date facts come from trusted user text only.
- Category-owned AI schema/instructions/versions.
- Revision-guarded brief activation and Task 6 claim.
- Validation: 56 focused tests and 13 live PostgreSQL tests passed.
- Review approved.

### Task 6

- Exactly three distinct concepts, one recommendation, and four scenes each.
- Guaranteed-sales wording such as `pasti laku` is rejected.
- Guarded atomic concept generation is the sole production concept-write path.
- SQL independently enforces concept count, recommendation count, unique IDs/orders, and scene count.
- Validation: 43 focused tests and 16 live PostgreSQL tests passed; ESLint and `git diff --check` passed.
- Review approved.

## Active Task 7

The first Task 7 implementation exists and passed 37 targeted tests, targeted ESLint, and `git diff --check`, but review requested changes.

Open release-blocking findings:

1. Clarification answer insertion and `needs_input -> analyzing` transition are separate operations. A transition followed by append failure strands the project in `analyzing` without the answer.
2. Duplicate handling is a read-before-write race. Concurrent submissions with the same idempotency key can return a revision conflict instead of deterministic duplicate success.
3. Tests do not cover append failure, retry after partial failure, concurrent same-key submissions, or database unique-conflict replay.
4. AI failure after atomic answer persistence needs an actionable retry path that does not duplicate the answer.

Required Task 7 fix:

- Add one owner-scoped repository operation and Supabase RPC that atomically:
  - verifies ownership, `needs_input`, and expected revision;
  - inserts or replays the project-scoped answer idempotency key;
  - transitions the project to `analyzing`;
  - increments revision;
  - returns a deterministic created, duplicate, or stale result.
- Remove Task 7 use-case reliance on separate transition and append calls.
- Add disposable PostgreSQL tests for success, concurrent same-key replay, stale revision, unauthorized owner, and rollback/invariant failure.
- Add application tests proving the persisted answer is reloaded into real analysis context.
- Use existing recoverable state/error conventions for post-persistence AI failure, allowing analysis retry without another answer insert.
- Follow strict RED/GREEN TDD and append evidence to `task-7-report.md`.
- Package the uncommitted diff and run an independent scoped re-review before marking Task 7 complete.

Prior fix attempts made no changes because subagent execution windows expired. The open findings remain untouched.

## Remaining Task 8

After Task 7 is approved:

- Generate Task 8 brief with the SDD `task-brief` script.
- Implement the recoverable dashboard chat and concept UI using existing app patterns and `DESIGN.md`.
- Before Next.js edits, inspect the installed docs under `node_modules/next/dist/docs/`; expected paths from older versions were not present, so locate actual files rather than assuming paths.
- Use server components by default, client components only for browser interaction, authenticated server actions, visible labels, user-safe states, and responsive desktop/mobile layout.
- Run task-scoped review and fix loop until approved.

## Final Review

After Task 8:

1. Run foundation-wide tests, live PostgreSQL integration tests, targeted lint, `git diff --check`, and the best available app typecheck/build validation.
2. Full typecheck previously reported stale generated `.next` validator imports. Re-check from a clean generated state if safe; do not delete unrelated user files.
3. Run `graphify update .`.
4. Package the whole uncommitted foundation diff using a temporary Git index because commits are not authorized.
5. Dispatch one broad final reviewer covering architecture, security, Next.js compliance, database atomicity/RLS, tests, and all plan requirements.
6. Apply one final fix wave if needed, then one scoped re-review.

## Workspace Notes

- All foundation changes are uncommitted.
- `graphify-out/**` may be dirty after updates; this is expected.
- A disposable PostgreSQL 16 container was previously available as `visuala-creative-video-postgres` on port `55432`.
- Integration tests require `CREATIVE_VIDEO_TEST_DATABASE_URL`, destructive opt-in, and a database name ending `_creative_video_test`.
- The foundation migration is an unapplied development migration and has been edited in place during Tasks 3-7.

## Suggested New-Window Prompt

```text
Continue the creative-video foundation implementation from `docs/superpowers/handoffs/2026-09-15-creative-video-foundation-handoff.md`. Use subagent-driven development. Resume Task 7 fix round 1, then complete Task 8 and the final whole-branch review. Do not commit, preserve unrelated dirty changes, and do not run paid AI calls.
```
