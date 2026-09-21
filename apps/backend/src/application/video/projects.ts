import { VideoError } from "../../domain/video/errors";
import { validateOutputSettings } from "../../domain/video/settings";
import type {
  ProjectAssetRepository, VideoProjectRepository, VideoVersionRepository,
} from "../../domain/video/contracts";
import type { AssetObjectStore } from "../../domain/ai-service/assets";
import type { VideoOutputSettings, VideoProject, VideoStyleId, VideoType } from "../../domain/video/types";

const MAX_TITLE_LENGTH = 120;

export type ProjectDependencies = {
  projects: VideoProjectRepository;
  assets: Pick<ProjectAssetRepository, "listOwned" | "softDelete">;
  versions: Pick<VideoVersionRepository, "listOwned">;
  objectStore: AssetObjectStore;
  createId: () => string;
};

export type CreateVideoProjectCommand = {
  userId: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  settings: VideoOutputSettings;
};

export async function createVideoProject(command: CreateVideoProjectCommand, dependencies: ProjectDependencies): Promise<VideoProject> {
  const title = command.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) throw invalidInput("The project title is required.");
  const settings = validateOutputSettings(command.settings);

  return dependencies.projects.create({
    id: dependencies.createId(),
    userId: command.userId,
    title,
    videoType: command.videoType,
    styleId: command.styleId,
    settings,
  });
}

export async function listVideoProjects(userId: string, dependencies: ProjectDependencies): Promise<VideoProject[]> {
  return dependencies.projects.listOwned(userId);
}

export async function getVideoProject(projectId: string, userId: string, dependencies: ProjectDependencies): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project) throw projectNotFound();
  return project;
}

/**
 * Soft deletes rows first, then removes objects best effort. A storage outage must not leave the
 * project readable, so the remaining object count is returned instead of failing the request; the
 * rows keep their `deleted_at`, which is what a later reconciliation pass keys off.
 */
export async function deleteVideoProject(projectId: string, userId: string, dependencies: ProjectDependencies): Promise<{ pendingObjectDeletions: number }> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project) {
    const existing = await dependencies.projects.getOwnedIncludingDeleted(projectId, userId);
    if (!existing || existing.status !== "deleted") throw projectNotFound();
    return { pendingObjectDeletions: 0 };
  }

  const [assets, versions] = await Promise.all([
    dependencies.assets.listOwned(projectId, userId),
    dependencies.versions.listOwned(projectId, userId),
  ]);

  await dependencies.projects.softDelete(projectId, userId);
  for (const asset of assets) await dependencies.assets.softDelete(asset.id, userId);

  const objectKeys = [...assets.map((asset) => asset.objectKey), ...versions.map((version) => version.outputObjectKey)];
  const results = await Promise.allSettled(objectKeys.map((key) => dependencies.objectStore.delete(key)));

  return { pendingObjectDeletions: results.filter((result) => result.status === "rejected").length };
}

export type ProjectResponse = {
  id: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  status: VideoProject["status"];
  settings: VideoOutputSettings;
  revisionRenderCount: number;
  createdAt: string;
  updatedAt: string;
};

/** The only shape a project is allowed to leave the backend in: no user id, no object keys. */
export function toProjectResponse(project: VideoProject): ProjectResponse {
  return {
    id: project.id,
    title: project.title,
    videoType: project.videoType,
    styleId: project.styleId,
    status: project.status,
    settings: project.settings,
    revisionRenderCount: project.revisionRenderCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function invalidInput(message: string): VideoError {
  return new VideoError("video_input_invalid", message);
}

function projectNotFound(): VideoError {
  return new VideoError("video_project_not_found", "The video project was not found.");
}
