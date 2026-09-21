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
