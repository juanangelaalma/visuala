export type VideoType = "product_promo" | "discount_promo" | "product_launch" | "menu_showcase";
export type VideoDurationSeconds = 6 | 10 | 15;
export type VideoAspectRatio = "9:16" | "1:1" | "16:9";
export type VideoResolution = "720p" | "1080p";
export type VideoStyleId = "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark";
export type VideoLanguage = string;

export type VideoProjectStatus =
  | "draft"
  | "interviewing"
  | "awaiting_approval"
  | "approved"
  | "rendering"
  | "ready"
  | "revision_draft"
  | "moderation_blocked"
  | "failed"
  | "deleted";

export type VideoRenderJobStatus = "queued" | "preparing" | "rendering" | "uploading" | "succeeded" | "failed" | "cancelled";

export type VideoOutputSettings = {
  durationSeconds: VideoDurationSeconds;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  language: VideoLanguage;
  voiceOverEnabled: boolean;
  musicEnabled: boolean;
};

export type VideoProject = {
  id: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  status: VideoProjectStatus;
  settings: VideoOutputSettings;
  revisionRenderCount: number;
  createdAt: string;
  updatedAt: string;
};

export type VideoAssetMimeType = "image/jpeg" | "image/png" | "image/webp";
export type VideoModerationStatus = "pending" | "allowed" | "blocked";

export type ProjectAsset = {
  id: string;
  mimeType: VideoAssetMimeType;
  byteSize: number;
  width: number;
  height: number;
  moderationStatus: VideoModerationStatus;
  previewUrl: string;
};

export type VideoMessageRole = "user" | "assistant";

export type VideoMessage = {
  id: string;
  role: VideoMessageRole;
  content: string;
  assetIds: string[];
  controls: unknown;
  createdAt: string;
};

export type VideoRenderJob = {
  id: string;
  status: VideoRenderJobStatus;
  isRevision: boolean;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  createdAt: string;
};

export type VideoVersion = {
  id: string;
  versionNumber: number;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  createdAt: string;
  playbackUrl: string;
};
