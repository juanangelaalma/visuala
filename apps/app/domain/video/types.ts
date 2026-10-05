export type VideoType = "product_promo" | "discount_promo" | "product_launch" | "menu_showcase" | "storefront_showcase";
/** Seconds of finished video, inside the 4..30 the backend accepts. */
export type VideoDurationSeconds = number;
export type VideoAspectRatio = "9:16" | "1:1" | "16:9";
export type VideoResolution = "720p" | "1080p";
/** One Design Pack ships with the engine; a customer pack becomes another id here. */
export type VideoStyleId = "creative-mode";
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
export type VideoOutputKind = "preview" | "final";

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

/** One module of a planned scene. The engine owns the full spec; the workspace only renders this. */
export type CompositionModule = {
  id: string;
  kind: "internal" | "catalog";
  content: Record<string, string>;
};

export type CompositionScene = {
  id: string;
  durationFrames: number;
  modules: CompositionModule[];
};

export type CompositionSpecView = {
  schemaVersion: string;
  format: { aspectRatio: string; fps: number; durationSeconds: number };
  style: { id: string; version: string };
  scenes: CompositionScene[];
};

/** One thing the validator refused. Empty on a plan that passed first try. */
export type CompositionIssue = {
  code: string;
  message: string;
  sceneId?: string;
  moduleId?: string;
};

export type VideoBriefRevision = {
  id: string;
  version: number;
  schemaVersion: string;
  isComplete: boolean;
  brief: VideoBrief;
  createdAt: string;
};

/**
 * The plan the user approves. `previewReady` is true only once a preview of exactly these bytes has
 * rendered, which is what the export requires; `latestJob` is the project's newest render job.
 */
export type VideoComposition = {
  id: string;
  version: number;
  schemaVersion: string;
  designPack: { id: string; version: string };
  isFallback: boolean;
  validationIssues: CompositionIssue[];
  candidates: unknown;
  spec: CompositionSpecView;
  createdAt: string;
  previewReady: boolean;
  /** The preview the user watches before approving; null until one has rendered. */
  previewUrl: string | null;
  latestJob: VideoRenderJob | null;
};

export type VideoRenderJob = {
  id: string;
  kind: VideoOutputKind;
  status: VideoRenderJobStatus;
  isRevision: boolean;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
};

export type VideoVersion = {
  id: string;
  versionNumber: number;
  /** The length the job was planned for; the engine refuses a render whose probe disagrees. */
  durationSeconds: VideoDurationSeconds;
  aspectRatio: string;
  resolution: string;
  createdAt: string;
  /** Null when the stored object is gone; the row is still reported so it can be listed. */
  playbackUrl: string | null;
};
