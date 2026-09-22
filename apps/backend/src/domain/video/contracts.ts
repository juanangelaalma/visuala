import type { AssetMimeType } from "../ai-service/assets";
import type {
  ProjectAsset, VideoBriefRevision, VideoMessage, VideoOutputSettings, VideoProject,
  VideoProjectStatus, VideoRenderJob, VideoStoryboardRevision, VideoStyleId, VideoType, VideoVersion,
} from "./types";

export type CreateVideoProjectInput = {
  id: string;
  userId: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  settings: VideoOutputSettings;
};

export interface VideoProjectRepository {
  create(input: CreateVideoProjectInput): Promise<VideoProject>;
  /** Excludes soft-deleted rows, so a deleted project reads as not found. */
  getOwned(projectId: string, userId: string): Promise<VideoProject | null>;
  /** Includes soft-deleted rows. Used only by deletion, so a second delete can be idempotent. */
  getOwnedIncludingDeleted(projectId: string, userId: string): Promise<VideoProject | null>;
  listOwned(userId: string): Promise<VideoProject[]>;
  softDelete(projectId: string, userId: string): Promise<void>;
  /** Returns the updated project, or null when the row is not in `expectedStatus`. */
  transition(projectId: string, userId: string, expectedStatus: VideoProjectStatus, nextStatus: VideoProjectStatus): Promise<VideoProject | null>;
  /** Used by the AI orchestration plan when the user changes style through chat before approval. */
  updateStyle(projectId: string, userId: string, styleId: VideoStyleId): Promise<VideoProject | null>;
  /** Increments the rerender counter only while it is below the PRD limit. Returns null when already at the limit. */
  consumeRerender(projectId: string, userId: string): Promise<VideoProject | null>;
}

export type CreateProjectAssetInput = {
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
};

export interface ProjectAssetRepository {
  create(input: CreateProjectAssetInput): Promise<ProjectAsset>;
  getOwned(assetId: string, userId: string): Promise<ProjectAsset | null>;
  listOwned(projectId: string, userId: string): Promise<ProjectAsset[]>;
  sumActiveBytes(projectId: string, userId: string): Promise<number>;
  softDelete(assetId: string, userId: string): Promise<void>;
}

export interface VideoMessageRepository {
  append(input: { id: string; projectId: string; userId: string; role: "user" | "assistant"; content: string; controls?: unknown; assetIds?: string[] }): Promise<VideoMessage>;
  listOwned(projectId: string, userId: string): Promise<VideoMessage[]>;
}

export type CreateBriefRevisionInput = {
  projectId: string;
  userId: string;
  schemaVersion: string;
  brief: unknown;
  isComplete: boolean;
  generatedBy: unknown;
  sourceMessageIds: string[];
};

export interface VideoBriefRevisionRepository {
  create(input: CreateBriefRevisionInput): Promise<VideoBriefRevision>;
  latestOwned(projectId: string, userId: string): Promise<VideoBriefRevision | null>;
  getOwned(revisionId: string, userId: string): Promise<VideoBriefRevision | null>;
}

export type CreateStoryboardRevisionInput = {
  projectId: string;
  userId: string;
  schemaVersion: string;
  briefRevisionId: string;
  scenes: unknown;
  totalDurationSeconds: number;
  generatedBy: unknown;
};

export interface VideoStoryboardRevisionRepository {
  create(input: CreateStoryboardRevisionInput): Promise<VideoStoryboardRevision>;
  latestOwned(projectId: string, userId: string): Promise<VideoStoryboardRevision | null>;
  getOwned(revisionId: string, userId: string): Promise<VideoStoryboardRevision | null>;
  approve(revisionId: string, userId: string, approvedAt: string, approvalSnapshot: unknown): Promise<VideoStoryboardRevision | null>;
}

export type CreateRenderJobInput = {
  id: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  briefRevisionId: string;
  storyboardRevisionId: string;
  parentVersionId?: string;
  isRevision: boolean;
  inputSnapshot: unknown;
};

export interface VideoRenderJobRepository {
  create(input: CreateRenderJobInput): Promise<VideoRenderJob>;
  getOwned(jobId: string, userId: string): Promise<VideoRenderJob | null>;
  /**
   * No owner scope: `getById`, `begin`, and `fail` are worker/queue-facing and the render worker is
   * server-side and runs without a user session. The worker only calls them for a job that was
   * already resolved through an owner-scoped path (`create` or `getOwned`), so the row's owner is
   * established before these run; they never discover a job on their own.
   */
  getById(jobId: string): Promise<VideoRenderJob | null>;
  /** Owner filter is part of the query, not the caller's responsibility. */
  findByIdempotencyKey(projectId: string, userId: string, idempotencyKey: string): Promise<VideoRenderJob | null>;
  /** Owner filter is part of the query, not the caller's responsibility. */
  findActiveForProject(projectId: string, userId: string): Promise<VideoRenderJob | null>;
  /** Conditional `queued -> preparing` update that also increments `attempts`. Null when the row was not queued. */
  begin(jobId: string): Promise<VideoRenderJob | null>;
  fail(jobId: string, errorCode: string): Promise<VideoRenderJob | null>;
  cancel(jobId: string, userId: string): Promise<VideoRenderJob | null>;
  /** The newest job for a project, so the workspace can render its state after a reload. */
  latestOwned(projectId: string, userId: string): Promise<VideoRenderJob | null>;
  /** Work discovery for the claim loop, oldest first. No owner scope: the queue is server-side. */
  listQueued(limit: number): Promise<VideoRenderJob[]>;
  /** Jobs that were started and then abandoned. No owner scope, for the same reason as `begin`. */
  listStale(startedBefore: string, limit: number): Promise<VideoRenderJob[]>;
  /** Conditional `preparing -> rendering`. Null means the worker no longer owns the job. */
  markRendering(jobId: string): Promise<VideoRenderJob | null>;
  /** Conditional `rendering -> uploading`. Null means the worker no longer owns the job. */
  markUploading(jobId: string): Promise<VideoRenderJob | null>;
  /** Conditional `uploading -> succeeded`, stamping `finished_at`. */
  succeed(jobId: string): Promise<VideoRenderJob | null>;
}

export type CreateVideoVersionInput = {
  /**
   * Minted by the worker before the upload, not by the database: the object key names the version id,
   * so the id has to exist before the row that points at it. Mirrors `CreateRenderJobInput`.
   */
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
};

export interface VideoVersionRepository {
  /** Written by the render plan's worker once an MP4 is uploaded. */
  create(input: CreateVideoVersionInput): Promise<VideoVersion>;
  listOwned(projectId: string, userId: string): Promise<VideoVersion[]>;
  getOwned(versionId: string, userId: string): Promise<VideoVersion | null>;
  latestOwned(projectId: string, userId: string): Promise<VideoVersion | null>;
}
