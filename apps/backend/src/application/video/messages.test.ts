import { describe, expect, it, vi } from "vitest";
import { appendVideoMessage, listVideoMessages } from "./messages";
import type { VideoMessage, VideoProject } from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const settings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true } as const;

function project(status: VideoProject["status"]): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status, settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated" };
}

function message(overrides: Partial<VideoMessage> = {}): VideoMessage {
  return { id: "message-1", projectId: PROJECT_ID, userId: USER_ID, role: "user", content: "halo", controls: null, assetIds: [], createdAt: "created", ...overrides };
}

function dependencies(status: VideoProject["status"] = "draft") {
  return {
    createId: () => "message-1",
    projects: { getOwned: vi.fn(async (): Promise<VideoProject | null> => project(status)), transition: vi.fn(async (): Promise<VideoProject | null> => project("interviewing")) },
    messages: { append: vi.fn(async (input) => ({ ...input, controls: null, assetIds: [], createdAt: "created" })), listOwned: vi.fn(async (): Promise<VideoMessage[]> => []) },
  };
}

describe("appendVideoMessage", () => {
  it("moves a draft project into interviewing on the first user message", async () => {
    const deps = dependencies("draft");

    const { project } = await appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "buat video jualan produk ini" }, deps);

    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "draft", "interviewing");
    expect(project.status).toBe("interviewing");
  });

  it("does not re-enter the transition once the project is already interviewing", async () => {
    const deps = dependencies("interviewing");

    await appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "harganya lima belas ribu" }, deps);

    expect(deps.projects.transition).not.toHaveBeenCalled();
  });

  it("treats a lost transition race as success", async () => {
    const deps = dependencies("draft");
    deps.projects.transition.mockResolvedValue(null);

    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps)).resolves.toMatchObject({ project: { status: "interviewing" } });
  });

  it("rejects blank content and a missing project", async () => {
    const deps = dependencies();

    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "   " }, deps)).rejects.toMatchObject({ code: "video_input_invalid" });

    deps.projects.getOwned.mockResolvedValue(null);
    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });

  it("refuses to add chat to a deleted project", async () => {
    const deps = dependencies("deleted");

    await expect(appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });

  it("appends the trimmed content with a server-generated id for the caller", async () => {
    const deps = dependencies("interviewing");

    await appendVideoMessage({ userId: USER_ID, projectId: PROJECT_ID, content: "  halo  ", assetIds: [] }, deps);

    expect(deps.messages.append).toHaveBeenCalledWith({ id: "message-1", projectId: PROJECT_ID, userId: USER_ID, role: "user", content: "  halo  ".trim(), assetIds: [] });
  });
});

describe("listVideoMessages", () => {
  it("returns the message projection for an owned project", async () => {
    const deps = dependencies("interviewing");
    deps.messages.listOwned.mockResolvedValue([message({ content: "harganya lima belas ribu" })]);

    await expect(listVideoMessages({ userId: USER_ID, projectId: PROJECT_ID }, deps)).resolves.toEqual([
      { id: "message-1", role: "user", content: "harganya lima belas ribu", assetIds: [], controls: null, createdAt: "created" },
    ]);
    expect(deps.messages.listOwned).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
  });

  it("hides another user's project behind a not-found error", async () => {
    const deps = dependencies("interviewing");
    deps.projects.getOwned.mockResolvedValue(null);

    await expect(listVideoMessages({ userId: "user-b", projectId: PROJECT_ID }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
    expect(deps.messages.listOwned).not.toHaveBeenCalled();
  });
});
