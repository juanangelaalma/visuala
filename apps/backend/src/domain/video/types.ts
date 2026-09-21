import type { AssetMimeType } from "../ai-service/assets";

export type VideoType = "product_promo" | "discount_promo" | "product_launch" | "menu_showcase";
export type VideoDurationSeconds = 6 | 10 | 15;
export type VideoAspectRatio = "9:16" | "1:1" | "16:9";
export type VideoResolution = "720p" | "1080p";
export type VideoStyleId = "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark";
export type VideoLanguage = string;

export type VideoProjectStatus =
  | "draft" | "interviewing" | "awaiting_approval" | "approved" | "rendering"
  | "ready" | "revision_draft" | "moderation_blocked" | "failed" | "deleted";

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
  userId: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  status: VideoProjectStatus;
  settings: VideoOutputSettings;
  revisionRenderCount: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAsset = {
  id: string;
  projectId: string;
  userId: string;
  objectKey: string;
  mimeType: AssetMimeType;
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
  rightsConfirmedAt: string;
  moderationStatus: "pending" | "allowed" | "blocked";
  deletedAt?: string;
  createdAt: string;
};

export type VideoMessage = {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  controls: unknown;
  assetIds: string[];
  createdAt: string;
};

export type GeneratedBy = { profileId: string; provider: string; model: string; promptVersion: string; requestId: string };

export type VideoBriefRevision = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  schemaVersion: string;
  brief: unknown;
  isComplete: boolean;
  generatedBy: GeneratedBy;
  sourceMessageIds: string[];
  createdAt: string;
};

export type VideoStoryboardRevision = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  schemaVersion: string;
  briefRevisionId: string;
  scenes: unknown;
  totalDurationSeconds: VideoDurationSeconds;
  generatedBy: GeneratedBy;
  approvedAt?: string;
  approvalSnapshot?: unknown;
  createdAt: string;
};

export type VideoRenderJob = {
  id: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  briefRevisionId: string;
  storyboardRevisionId: string;
  parentVersionId?: string;
  isRevision: boolean;
  inputSnapshot: unknown;
  status: VideoRenderJobStatus;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type VideoVersion = {
  id: string;
  projectId: string;
  userId: string;
  versionNumber: number;
  renderJobId: string;
  parentVersionId?: string;
  outputObjectKey: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  manifestHash: string;
  createdAt: string;
};
