import { MAX_ASSET_BYTES, type AssetMimeType, type AssetObjectStore } from "../../domain/ai-service/assets";
import type { AIImageLimits } from "../../domain/ai-service/config";
import type { AssetResolver } from "../../domain/ai-service/contracts";
import type { ResolvedAIAsset } from "../../domain/ai-service/types";
import { VideoError } from "../../domain/video/errors";
import { canMutateProjectAssets } from "../../domain/video/state-machine";
import type { AssetLimits } from "../../domain/video/limits";
import type { ProjectAssetRepository, VideoProjectRepository } from "../../domain/video/contracts";
import type { ProjectAsset, VideoProject } from "../../domain/video/types";
import { sha256, validateImage } from "../ai-service/register-asset";

type AssetDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned">;
  assets: ProjectAssetRepository;
  objectStore: AssetObjectStore;
  limits: AssetLimits;
  createId: () => string;
};

export type RegisterProjectAssetCommand = {
  userId: string;
  projectId: string;
  bytes: Uint8Array;
  declaredMimeType: string;
  rightsConfirmed: boolean;
};

export async function registerProjectAsset(command: RegisterProjectAssetCommand, dependencies: AssetDependencies): Promise<ProjectAsset> {
  if (!command.rightsConfirmed) throw invalidInput("Confirm that you have the right to use this asset.");

  const project = await requireEditableProject(command.projectId, command.userId, dependencies);
  const image = validateAsset(command.bytes, command.declaredMimeType, dependencies.limits);
  await enforceProjectLimits(project, command.userId, command.bytes.byteLength, dependencies);

  const id = dependencies.createId();
  // The key is built from the canonical id, not the request string: Postgres accepts several
  // spellings of a UUID, so the row's id is the only stable identity for the object path.
  const objectKey = objectKeyFor(project.id, id, image.mimeType);
  await dependencies.objectStore.write(objectKey, command.bytes, image.mimeType);

  // The object and the row are committed in separate steps, so a failure after the insert has to
  // undo whichever write landed. `insertedAssetId` stays undefined when the insert itself failed,
  // where there is no row to compensate.
  let insertedAssetId: string | undefined;

  try {
    const asset = await dependencies.assets.create({
      id,
      projectId: project.id,
      userId: command.userId,
      objectKey,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      sha256: sha256(command.bytes),
      width: image.width,
      height: image.height,
      rightsConfirmedAt: new Date().toISOString(),
    });
    insertedAssetId = asset.id;
    await assertProjectStillEditable(command.projectId, command.userId, dependencies);
    return asset;
  } catch (error) {
    // Both compensations are best-effort: a cleanup failure must never mask the original error.
    await dependencies.objectStore.delete(objectKey).catch(() => undefined);
    if (insertedAssetId !== undefined) await dependencies.assets.softDelete(insertedAssetId, command.userId).catch(() => undefined);
    throw error;
  }
}

export async function deleteProjectAsset(
  command: { userId: string; projectId: string; assetId: string },
  dependencies: AssetDependencies,
): Promise<void> {
  const project = await requireEditableProject(command.projectId, command.userId, dependencies);
  const asset = await dependencies.assets.getOwned(command.assetId, command.userId);
  // Compared against the canonical id, so a request that spells the UUID differently still matches
  // the stored row instead of answering 404 for an asset the caller owns.
  if (!asset || asset.projectId !== project.id) throw projectNotFound();

  await dependencies.assets.softDelete(command.assetId, command.userId);
  await dependencies.objectStore.delete(asset.objectKey).catch(() => undefined);
}

export type ProjectAssetResponse = {
  id: string;
  mimeType: AssetMimeType;
  byteSize: number;
  width: number;
  height: number;
  moderationStatus: ProjectAsset["moderationStatus"];
  /** Null when the stored object is gone, so the row stays visible instead of failing the list. */
  previewUrl: string | null;
};

export async function listProjectAssets(
  command: { userId: string; projectId: string },
  dependencies: AssetDependencies & { signedUrl: (objectKey: string) => Promise<string | null> },
): Promise<ProjectAssetResponse[]> {
  const project = await dependencies.projects.getOwned(command.projectId, command.userId);
  if (!project) throw projectNotFound();
  if (project.status === "deleted") throw projectNotFound();

  const assets = await dependencies.assets.listOwned(command.projectId, command.userId);
  return Promise.all(assets.map(async (asset) => ({
    id: asset.id,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    moderationStatus: asset.moderationStatus,
    previewUrl: await dependencies.signedUrl(asset.objectKey),
  })));
}

/**
 * The AI service's extension point for reading project assets. Bytes are re-validated against the
 * persisted hash, size, and dimensions on every read, so an object overwritten after registration
 * is refused rather than sent to a model or a render.
 *
 * `pending` is permitted while the moderation provider is not yet wired; the orchestration plan
 * must flip this to require `allowed` in the same change that adds the moderation call.
 */
export class ProjectAssetResolver implements AssetResolver {
  constructor(
    private readonly assets: Pick<ProjectAssetRepository, "getOwned">,
    private readonly objectStore: AssetObjectStore,
  ) {}

  async resolve(assetId: string, userId: string, limits: AIImageLimits): Promise<ResolvedAIAsset> {
    const asset = await this.assets.getOwned(assetId, userId);
    if (!asset || asset.deletedAt || asset.moderationStatus === "blocked") throw invalidAsset();

    const maxBytes = Math.min(MAX_ASSET_BYTES, limits.maxImageBytes);
    const bytes = await this.objectStore.read(asset.objectKey, maxBytes).catch(() => {
      throw invalidAsset();
    });
    const image = validateAsset(bytes, asset.mimeType, {
      minImageDimension: 1,
      maxImageDimension: Math.max(limits.maxImageWidth, limits.maxImageHeight),
    });

    if (image.byteSize !== asset.byteSize || image.width !== asset.width || image.height !== asset.height || sha256(bytes) !== asset.sha256) throw invalidAsset();
    if (image.width > limits.maxImageWidth || image.height > limits.maxImageHeight) throw invalidAsset();

    return { assetId: asset.id, bytes, mimeType: asset.mimeType };
  }
}

async function requireEditableProject(projectId: string, userId: string, dependencies: Pick<AssetDependencies, "projects">): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || project.status === "deleted") throw projectNotFound();
  if (!canMutateProjectAssets(project.status)) throw new VideoError("video_state_conflict", "Assets cannot change while the video is being rendered.");
  return project;
}

/**
 * The precondition the project-asset use cases share with the message and revision use cases:
 * the caller owns a project that is not deleted and still accepts changes.
 */
export async function assertProjectActive(projectId: string, userId: string, dependencies: Pick<AssetDependencies, "projects">): Promise<void> {
  await requireEditableProject(projectId, userId, dependencies);
}

async function assertProjectStillEditable(projectId: string, userId: string, dependencies: Pick<AssetDependencies, "projects">): Promise<void> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || !canMutateProjectAssets(project.status)) throw projectNotFound();
}

async function enforceProjectLimits(project: VideoProject, userId: string, incomingBytes: number, dependencies: AssetDependencies): Promise<void> {
  const [existing, usedBytes] = await Promise.all([
    dependencies.assets.listOwned(project.id, userId),
    dependencies.assets.sumActiveBytes(project.id, userId),
  ]);

  if (existing.length >= dependencies.limits.maxAssetsPerProject) throw limitReached();
  if (usedBytes + incomingBytes > dependencies.limits.maxProjectAssetBytes) throw limitReached();
}

function validateAsset(bytes: Uint8Array, declaredMimeType: string, limits: { minImageDimension: number; maxImageDimension: number }) {
  let image;
  try {
    image = validateImage(bytes, declaredMimeType, MAX_ASSET_BYTES);
  } catch {
    throw invalidAsset();
  }
  if (image.width < limits.minImageDimension || image.height < limits.minImageDimension) throw invalidAsset();
  if (image.width > limits.maxImageDimension || image.height > limits.maxImageDimension) throw invalidAsset();
  return image;
}

export function objectKeyFor(projectId: string, assetId: string, mimeType: AssetMimeType): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return `video-projects/${projectId}/${assetId}.${extension}`;
}

function invalidInput(message: string): VideoError {
  return new VideoError("video_input_invalid", message);
}

function invalidAsset(): VideoError {
  return new VideoError("video_asset_invalid", "The image is unavailable or invalid.");
}

function limitReached(): VideoError {
  return new VideoError("video_asset_limit_reached", "This project already has the maximum number of images.");
}

function projectNotFound(): VideoError {
  return new VideoError("video_project_not_found", "The video project was not found.");
}
