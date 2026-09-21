import { VideoError } from "../../domain/video/errors";
import type { VideoProjectRepository, VideoVersionRepository } from "../../domain/video/contracts";
import type { VideoVersion } from "../../domain/video/types";

export type VersionDependencies = {
  signedUrl: (objectKey: string) => Promise<string>;
  projects: Pick<VideoProjectRepository, "getOwned">;
  versions: Pick<VideoVersionRepository, "listOwned" | "getOwned">;
};

export type VersionResponse = {
  id: string;
  versionNumber: number;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  createdAt: string;
  playbackUrl: string;
};

/**
 * Lists the versions of a project with a short-lived playback URL each. The object key is signed per
 * request and after the ownership check below: it is never stored as a canonical reference and never
 * leaves the backend.
 */
export async function listVideoVersions(
  command: { userId: string; projectId: string },
  dependencies: VersionDependencies,
): Promise<VersionResponse[]> {
  await requireOwnedProject(command.projectId, command.userId, dependencies);

  const versions = await dependencies.versions.listOwned(command.projectId, command.userId);
  return Promise.all(versions.map(async (version) => toVersionResponse(version, await dependencies.signedUrl(version.outputObjectKey))));
}

/** A download is a second signed URL for the same object, minted only for the project's owner. */
export async function createVersionDownloadUrl(
  command: { userId: string; projectId: string; versionId: string },
  dependencies: VersionDependencies,
): Promise<{ url: string }> {
  await requireOwnedProject(command.projectId, command.userId, dependencies);

  const version = await dependencies.versions.getOwned(command.versionId, command.userId);
  if (!version || version.projectId !== command.projectId) throw versionNotFound();

  return { url: await dependencies.signedUrl(version.outputObjectKey) };
}

/** The only shape a version is allowed to leave the backend in: no user id, no object key. */
function toVersionResponse(version: VideoVersion, playbackUrl: string): VersionResponse {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    durationSeconds: version.durationSeconds,
    aspectRatio: version.aspectRatio,
    resolution: version.resolution,
    createdAt: version.createdAt,
    playbackUrl,
  };
}

async function requireOwnedProject(projectId: string, userId: string, dependencies: VersionDependencies): Promise<void> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project) throw new VideoError("video_project_not_found", "The video project was not found.");
}

function versionNotFound(): VideoError {
  return new VideoError("video_version_not_found", "The video version was not found.");
}
