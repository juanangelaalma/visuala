import { VideoError } from "./errors";
import type { VideoProjectStatus, VideoRenderJobStatus } from "./types";

/**
 * The PRD diagram draws `revision_draft -> rendering`. Story 4 and Story 6 both require explicit
 * approval before any render, so the revision path is realised as
 * `revision_draft -> awaiting_approval -> approved -> rendering`.
 *
 * `rendering -> approved` is the cancellation path: a job cancelled while it is still queued
 * releases the project back to the approved state so the user can render again without spending a
 * rerender. Story 6 forbids any other way back out of `rendering`.
 *
 * The PRD's "any active state -> moderation_blocked | failed | deleted" rule also covers
 * `rendering` and `ready`, which are active states: a post-render moderation verdict or a late
 * failure still has to be recordable.
 */
const TRANSITIONS: Record<VideoProjectStatus, readonly VideoProjectStatus[]> = {
  draft: ["interviewing", "moderation_blocked", "failed", "deleted"],
  interviewing: ["awaiting_approval", "moderation_blocked", "failed", "deleted"],
  awaiting_approval: ["interviewing", "approved", "moderation_blocked", "failed", "deleted"],
  approved: ["rendering", "moderation_blocked", "failed", "deleted"],
  rendering: ["ready", "approved", "moderation_blocked", "failed", "deleted"],
  ready: ["revision_draft", "moderation_blocked", "failed", "deleted"],
  revision_draft: ["awaiting_approval", "moderation_blocked", "failed", "deleted"],
  moderation_blocked: ["deleted"],
  failed: ["deleted"],
  deleted: [],
};

const ASSET_EDITABLE_STATUSES: readonly VideoProjectStatus[] = ["draft", "interviewing", "awaiting_approval", "revision_draft"];
const ACTIVE_RENDER_JOB_STATUSES: readonly VideoRenderJobStatus[] = ["queued", "preparing", "rendering", "uploading"];

export function canTransitionVideoProjectStatus(from: VideoProjectStatus, to: VideoProjectStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertVideoProjectTransition(from: VideoProjectStatus, to: VideoProjectStatus): void {
  if (!canTransitionVideoProjectStatus(from, to)) {
    throw new VideoError("video_state_conflict", `The project cannot move from ${from} to ${to}.`);
  }
}

export function canMutateProjectAssets(status: VideoProjectStatus): boolean {
  return ASSET_EDITABLE_STATUSES.includes(status);
}

export function isRenderJobActive(status: VideoRenderJobStatus): boolean {
  return ACTIVE_RENDER_JOB_STATUSES.includes(status);
}
