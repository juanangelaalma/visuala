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
  /** Null when the stored object is gone; the row is still reported so it can be removed. */
  previewUrl: string | null;
};

export type VideoMessageRole = "user" | "assistant";

export type InterviewControl = "single_select" | "multi_select" | "free_text";

export type InterviewOption = {
  id: string;
  label: string;
  detail: string | null;
};

/** The question an assistant turn carries in `controls`, so the workspace can render choices. */
export type InterviewTurn = {
  question: string;
  control: InterviewControl;
  options: InterviewOption[];
  recommendedOptionId: string | null;
  recommendationReason: string | null;
  targetFields: string[];
  briefComplete: boolean;
};

export type VideoMessage = {
  id: string;
  role: VideoMessageRole;
  content: string;
  assetIds: string[];
  controls: InterviewTurn | null;
  createdAt: string;
};

export type VideoOffer = {
  label: string;
  detail: string;
};

export type VideoMenuItem = {
  name: string;
  price: string | null;
};

export type VideoFactSource = "user_message" | "user_confirmation" | "asset_analysis";

export type VideoFact = {
  field: string;
  value: string;
  source: VideoFactSource;
};

/** The tracked brief. A field is null while the interview has not settled it yet. */
export type VideoBrief = {
  productName: string | null;
  productCategory: string | null;
  audience: string | null;
  objective: string | null;
  keyMessage: string | null;
  offer: VideoOffer | null;
  callToAction: string | null;
  orderDestination: string | null;
  brandName: string | null;
  styleId: VideoStyleId;
  outputSettings: VideoOutputSettings;
  menuItems: VideoMenuItem[] | null;
  facts: VideoFact[];
};

export type StoryboardTransition = "cut" | "fade" | "slide" | "zoom";

export type StoryboardScene = {
  order: number;
  startSeconds: number;
  endSeconds: number;
  visual: string;
  onScreenTitle: string;
  onScreenCopy: string;
  voiceOver: string | null;
  caption: string | null;
  assetIds: string[];
  audioCue: string | null;
  transition: StoryboardTransition;
};

export type VideoBriefRevision = {
  id: string;
  version: number;
  schemaVersion: string;
  isComplete: boolean;
  brief: VideoBrief;
  createdAt: string;
};

export type VideoStoryboardRevision = {
  id: string;
  version: number;
  schemaVersion: string;
  briefRevisionId: string;
  scenes: StoryboardScene[];
  totalDurationSeconds: VideoDurationSeconds;
  approvedAt?: string;
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
