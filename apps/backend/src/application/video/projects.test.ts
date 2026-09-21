import { describe, expect, it, vi } from "vitest";
import { createVideoProject, deleteVideoProject, getVideoProject, listVideoProjects, toProjectResponse } from "./projects";
import type { VideoProject } from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const settings = { durationSeconds: 6 as const, aspectRatio: "9:16" as const, resolution: "720p" as const, language: "id", voiceOverEnabled: true, musicEnabled: true };

function project(overrides = {}) {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo" as const, styleId: "bold_pop" as const, status: "draft" as const, settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated", ...overrides };
}

function asset(overrides = {}) {
  return { id: "asset-1", projectId: PROJECT_ID, userId: USER_ID, objectKey: "video-projects/p/a.png", mimeType: "image/png" as const, byteSize: 1, sha256: "0".repeat(64), width: 2, height: 3, rightsConfirmedAt: "rights", moderationStatus: "allowed" as const, createdAt: "created", ...overrides };
}

function version(overrides = {}) {
  return { id: "v1", projectId: PROJECT_ID, userId: USER_ID, versionNumber: 1, renderJobId: "job-1", outputObjectKey: "video-versions/p/v1.mp4", durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", manifestHash: "hash", createdAt: "created", ...overrides };
}

function dependencies() {
  return {
    createId: () => PROJECT_ID,
    projects: {
      create: vi.fn(async (input) => project(input)),
      getOwned: vi.fn(async (): Promise<VideoProject | null> => project()),
      getOwnedIncludingDeleted: vi.fn(async (): Promise<VideoProject | null> => project()),
      listOwned: vi.fn(async () => [project()]),
      softDelete: vi.fn(async () => undefined),
      transition: vi.fn(async () => project()),
      updateStyle: vi.fn(async () => project()),
      consumeRerender: vi.fn(async () => project()),
    },
    assets: { listOwned: vi.fn(async () => [asset()]), softDelete: vi.fn(async () => undefined) },
    versions: { listOwned: vi.fn(async () => [version()]) },
    objectStore: { write: vi.fn(), read: vi.fn(), delete: vi.fn() },
  };
}

describe("createVideoProject", () => {
  it("derives ownership from the caller and starts in draft", async () => {
    const deps = dependencies();

    await createVideoProject({ userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", settings }, deps);

    expect(deps.projects.create).toHaveBeenCalledWith({ id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", settings });
  });

  it("rejects settings the render engine never verified", async () => {
    const deps = dependencies();

    await expect(createVideoProject({ userId: USER_ID, title: "Promo", videoType: "product_promo", styleId: "bold_pop", settings: { ...settings, durationSeconds: 7 as never } }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.projects.create).not.toHaveBeenCalled();
  });

  it("rejects an empty or overlong title", async () => {
    const deps = dependencies();

    await expect(createVideoProject({ userId: USER_ID, title: "   ", videoType: "product_promo", styleId: "bold_pop", settings }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    await expect(createVideoProject({ userId: USER_ID, title: "x".repeat(121), videoType: "product_promo", styleId: "bold_pop", settings }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });
});

describe("getVideoProject", () => {
  it("hides another user's project behind a not-found error", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);

    await expect(getVideoProject(PROJECT_ID, "user-b", deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });
});

describe("deleteVideoProject", () => {
  it("soft deletes the project and every asset before removing objects", async () => {
    const deps = dependencies();

    await deleteVideoProject(PROJECT_ID, USER_ID, deps);

    expect(deps.projects.softDelete).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    expect(deps.assets.softDelete).toHaveBeenCalledWith("asset-1", USER_ID);
    expect(deps.objectStore.delete.mock.calls).toEqual([["video-projects/p/a.png"], ["video-versions/p/v1.mp4"]]);
  });

  it("is idempotent on a second call and reports how many objects are still pending", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);
    deps.projects.getOwnedIncludingDeleted.mockResolvedValue(project({ status: "deleted", deletedAt: "deleted" }));

    await expect(deleteVideoProject(PROJECT_ID, USER_ID, deps)).resolves.toEqual({ pendingObjectDeletions: 0 });
    expect(deps.projects.softDelete).not.toHaveBeenCalled();
  });

  it("still hides a project the caller does not own", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);
    deps.projects.getOwnedIncludingDeleted.mockResolvedValue(null);

    await expect(deleteVideoProject(PROJECT_ID, "user-b", deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });

  it("succeeds with the rows deleted when object cleanup fails", async () => {
    const deps = dependencies();
    deps.objectStore.delete.mockRejectedValue(new Error("storage unavailable"));

    await expect(deleteVideoProject(PROJECT_ID, USER_ID, deps)).resolves.toEqual({ pendingObjectDeletions: 2 });
  });
});

describe("listVideoProjects", () => {
  it("scopes the query to the caller", async () => {
    const deps = dependencies();

    await listVideoProjects(USER_ID, deps);

    expect(deps.projects.listOwned).toHaveBeenCalledWith(USER_ID);
  });
});

describe("toProjectResponse", () => {
  it("strips the owner and exposes only the public project shape", () => {
    const response = toProjectResponse(project());

    // The fixture carries `userId`; the projection is the one place a project leaves the backend, so
    // the owner must not survive it.
    expect("userId" in response).toBe(false);
    expect(Object.keys(response).sort()).toEqual([
      "createdAt", "id", "revisionRenderCount", "settings", "status", "styleId", "title", "updatedAt", "videoType",
    ]);
  });
});
