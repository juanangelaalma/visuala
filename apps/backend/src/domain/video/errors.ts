export type VideoErrorCode =
  | "video_project_not_found"
  | "video_render_job_not_found"
  | "video_version_not_found"
  | "video_input_invalid"
  | "video_asset_invalid"
  | "video_asset_limit_reached"
  | "video_approval_incomplete"
  | "video_state_conflict"
  | "video_revision_quota_exhausted";

export class VideoError extends Error {
  readonly code: VideoErrorCode;

  constructor(code: VideoErrorCode, message: string) {
    super(message);
    this.name = "VideoError";
    this.code = code;
  }
}

/**
 * Every code a render job's `error_code` may hold, and the whole of a render's failure vocabulary.
 * Deliberately not part of `VideoErrorCode`: these never answer an HTTP request (the worker writes
 * them onto the job row), and `plugins/errors.ts` maps `VideoErrorCode` exhaustively to statuses, so
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
