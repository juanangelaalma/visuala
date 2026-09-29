import type { AssetMimeType } from "../ai-service/assets";
import type {
  ProjectAsset, VideoBriefRevision, VideoMessage, VideoOutputSettings, VideoProject, VideoProjectStatus, VideoStyleId, VideoType,
} from "./types";

export type CreateVideoProjectInput = {
  id: string;
  userId: string;
  idempotencyKey: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  settings: VideoOutputSettings;
};

export interface VideoProjectRepository {
  create(input: CreateVideoProjectInput): Promise<VideoProject>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<VideoProject | null>;
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
