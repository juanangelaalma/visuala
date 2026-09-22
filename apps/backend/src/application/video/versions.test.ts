import { describe, expect, it, vi } from "vitest";
import { createVersionDownloadUrl, listVideoVersions } from "./versions";
import type { VideoProject, VideoVersion } from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";

function project(status: VideoProject["status"] = "ready"): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status, settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true }, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated" };
}

function version(overrides: Partial<VideoVersion> = {}): VideoVersion {
  return { id: VERSION_ID, projectId: PROJECT_ID, userId: USER_ID, versionNumber: 2, renderJobId: "job-1", outputObjectKey: `video-versions/${PROJECT_ID}/${VERSION_ID}.mp4`, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", manifestHash: "hash", createdAt: "created", ...overrides };
}

function dependencies() {
  return {
    signedUrl: vi.fn(async (key: string): Promise<string | null> => `https://signed.example/${key}`),
    projects: { getOwned: vi.fn(async (): Promise<VideoProject | null> => project()) },
    versions: {
      listOwned: vi.fn(async (): Promise<VideoVersion[]> => [version()]),
      getOwned: vi.fn(async (): Promise<VideoVersion | null> => version()),
    },
  };
}

describe("versions", () => {
  it("lists versions with a signed playback url and no object key", async () => {
    const versions = await listVideoVersions({ userId: USER_ID, projectId: PROJECT_ID }, dependencies());

    expect(versions).toEqual([{ id: VERSION_ID, versionNumber: 2, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", createdAt: "created", playbackUrl: `https://signed.example/video-versions/${PROJECT_ID}/${VERSION_ID}.mp4` }]);
    expect(JSON.stringify(versions)).not.toContain("outputObjectKey");
  });

  it("signs a download only for the owner of the project and version", async () => {
    const deps = dependencies();

    await expect(createVersionDownloadUrl({ userId: USER_ID, projectId: PROJECT_ID, versionId: VERSION_ID }, deps)).resolves.toMatchObject({ url: `https://signed.example/video-versions/${PROJECT_ID}/${VERSION_ID}.mp4` });

    deps.versions.getOwned.mockResolvedValue(null);
    await expect(createVersionDownloadUrl({ userId: "user-b", projectId: PROJECT_ID, versionId: VERSION_ID }, deps)).rejects.toMatchObject({ code: "video_version_not_found" });
  });

  it("hides a version that belongs to another project", async () => {
    const deps = dependencies();
    deps.versions.getOwned.mockResolvedValue(version({ projectId: "66666666-6666-4666-8666-666666666666" }));

    await expect(createVersionDownloadUrl({ userId: USER_ID, projectId: PROJECT_ID, versionId: VERSION_ID }, deps)).rejects.toMatchObject({ code: "video_version_not_found" });
    expect(deps.signedUrl).not.toHaveBeenCalled();
  });

  it("hides the versions of a project the caller does not own", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);

    await expect(listVideoVersions({ userId: "user-b", projectId: PROJECT_ID }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
    expect(deps.versions.listOwned).not.toHaveBeenCalled();
  });

  it("keeps a version whose object is gone and reports a null playback url", async () => {
    const deps = dependencies();
    deps.signedUrl.mockResolvedValue(null);

    const versions = await listVideoVersions({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(versions).toHaveLength(1);
    expect(versions[0]?.playbackUrl).toBeNull();
  });

  it("answers a download whose object is gone as a missing version, not a server fault", async () => {
    const deps = dependencies();
    deps.signedUrl.mockResolvedValue(null);

    await expect(createVersionDownloadUrl({ userId: USER_ID, projectId: PROJECT_ID, versionId: VERSION_ID }, deps))
      .rejects.toMatchObject({ code: "video_version_not_found" });
  });
});
