import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  publicClient: vi.fn(),
  userClient: vi.fn(),
  createVideoProject: vi.fn(),
  listVideoProjects: vi.fn(),
  getVideoProject: vi.fn(),
  deleteVideoProject: vi.fn(),
  registerProjectAsset: vi.fn(),
  deleteProjectAsset: vi.fn(),
  listProjectAssets: vi.fn(),
  appendVideoMessage: vi.fn(),
  listVideoMessages: vi.fn(),
  services: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({ createSupabasePublicClient: mocks.publicClient, createSupabaseUserClient: mocks.userClient, createSupabaseServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/application/video/services", () => ({ createVideoProjectServices: mocks.services }));
vi.mock("@/application/video/projects", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/projects")>("@/application/video/projects");
  return { ...actual, createVideoProject: mocks.createVideoProject, listVideoProjects: mocks.listVideoProjects, getVideoProject: mocks.getVideoProject, deleteVideoProject: mocks.deleteVideoProject };
});
vi.mock("@/application/video/assets", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/assets")>("@/application/video/assets");
  return { ...actual, registerProjectAsset: mocks.registerProjectAsset, deleteProjectAsset: mocks.deleteProjectAsset, listProjectAssets: mocks.listProjectAssets };
});
vi.mock("@/application/video/messages", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/messages")>("@/application/video/messages");
  return { ...actual, appendVideoMessage: mocks.appendVideoMessage, listVideoMessages: mocks.listVideoMessages };
});

import { VideoError } from "@/domain/video/errors";
import { createApp } from "@/app";

const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
const project = { id: "33333333-3333-4333-8333-333333333333", title: "Promo", videoType: "product_promo", styleId: "bold_pop", status: "draft", settings: {}, revisionRenderCount: 0, createdAt: "c", updatedAt: "u" };
const asset = { id: "22222222-2222-4222-8222-222222222222", projectId: project.id, objectKey: `video-projects/${project.id}/22222222-2222-4222-8222-222222222222.png`, mimeType: "image/png", byteSize: 68, sha256: "0".repeat(64), width: 2, height: 3, rightsConfirmedAt: "r", moderationStatus: "pending", createdAt: "c" };
const assetPreview = { id: asset.id, mimeType: "image/png", byteSize: asset.byteSize, width: 2, height: 3, moderationStatus: "pending", previewUrl: `https://signed.example/${asset.objectKey}` };
const pngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));
const message = { id: "message-1", projectId: project.id, userId: user.id, role: "user", content: "buat video jualan", controls: null, assetIds: [] as string[], createdAt: "c" };
const messageResponse = { id: message.id, role: "user", content: message.content, assetIds: message.assetIds, controls: null, createdAt: message.createdAt };
const interviewingProject = { ...project, status: "interviewing" };

function send(method: string, path: string, options: { token?: string; body?: unknown; headers?: Record<string, string>; assetBytes?: Uint8Array } = {}) {
  return createApp().handle(new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...options.headers },
    ...(options.assetBytes !== undefined ? { body: options.assetBytes } : options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  }));
}

describe("video project routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.services.mockReturnValue({});
    mocks.createVideoProject.mockResolvedValue(project);
    mocks.listVideoProjects.mockResolvedValue([project]);
    mocks.getVideoProject.mockResolvedValue(project);
    mocks.deleteVideoProject.mockResolvedValue({ pendingObjectDeletions: 0 });
    mocks.registerProjectAsset.mockResolvedValue(asset);
    mocks.deleteProjectAsset.mockResolvedValue(undefined);
    mocks.listProjectAssets.mockResolvedValue([assetPreview]);
  });

  it("requires authentication on every route", async () => {
    for (const [method, path] of [["POST", "/video-projects"], ["GET", "/video-projects"], ["GET", `/video-projects/${project.id}`], ["DELETE", `/video-projects/${project.id}`], ["POST", `/video-projects/${project.id}/assets`], ["GET", `/video-projects/${project.id}/assets`], ["DELETE", `/video-projects/${project.id}/assets/${asset.id}`]] as const) {
      expect((await send(method, path)).status).toBe(401);
    }
    expect(mocks.createVideoProject).not.toHaveBeenCalled();
    expect(mocks.registerProjectAsset).not.toHaveBeenCalled();
  });

  it("creates a project scoped to the authenticated user and answers 201", async () => {
    const response = await send("POST", "/video-projects", { token: "token", body: { title: "Promo", videoType: "product_promo", styleId: "bold_pop", settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true } } });

    expect(response.status).toBe(201);
    expect(mocks.createVideoProject).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), expect.anything());
    await expect(response.json()).resolves.toEqual({ project });
  });

  it("rejects a body that carries a client-owned field", async () => {
    const response = await send("POST", "/video-projects", { token: "token", body: { title: "Promo", videoType: "product_promo", styleId: "bold_pop", status: "approved", settings: {} } });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.createVideoProject).not.toHaveBeenCalled();
  });

  it("maps a domain not-found to 404 without leaking database text", async () => {
    mocks.getVideoProject.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("GET", `/video-projects/${project.id}`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });

  it("maps a state conflict to 409", async () => {
    mocks.deleteVideoProject.mockRejectedValue(new VideoError("video_state_conflict", "The project cannot move from ready to interviewing."));

    expect((await send("DELETE", `/video-projects/${project.id}`, { token: "token" })).status).toBe(409);
  });

  it("rejects an upload whose declared type is not an image before reading the body", async () => {
    const response = await send("POST", `/video-projects/${project.id}/assets`, { token: "token", headers: { "content-type": "text/plain" }, assetBytes: pngBytes });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Upload a valid JPEG, PNG, or WebP image up to 10 MB.", code: "video_asset_invalid" });
    expect(mocks.registerProjectAsset).not.toHaveBeenCalled();
  });

  it("rejects an upload that declares more than ten megabytes before reading the body", async () => {
    const response = await send("POST", `/video-projects/${project.id}/assets`, { token: "token", headers: { "content-type": "image/png", "content-length": String(10 * 1024 * 1024 + 1) }, assetBytes: pngBytes });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Upload a valid JPEG, PNG, or WebP image up to 10 MB.", code: "video_asset_invalid" });
    expect(mocks.registerProjectAsset).not.toHaveBeenCalled();
  });

  it("accepts an image for the authenticated user and answers 201 with the projection", async () => {
    const response = await send("POST", `/video-projects/${project.id}/assets`, { token: "token", headers: { "content-type": "image/png", "x-asset-rights-confirmed": "true" }, assetBytes: pngBytes });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ asset: { id: asset.id, mimeType: "image/png", byteSize: asset.byteSize, width: 2, height: 3, moderationStatus: "pending" } });
    expect(mocks.registerProjectAsset).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", projectId: project.id, declaredMimeType: "image/png", rightsConfirmed: true, bytes: pngBytes }),
      expect.anything(),
    );
  });

  it("lists assets with short-lived preview URLs for the project owner", async () => {
    const response = await send("GET", `/video-projects/${project.id}/assets`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ assets: [assetPreview] });
    expect(mocks.listProjectAssets).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });

  it("hides another user's asset behind a 404 on delete", async () => {
    mocks.deleteProjectAsset.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("DELETE", `/video-projects/${project.id}/assets/${asset.id}`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
    expect(mocks.deleteProjectAsset).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, assetId: asset.id }, expect.anything());
  });

  it("deletes an owned asset", async () => {
    const response = await send("DELETE", `/video-projects/${project.id}/assets/${asset.id}`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });
});

describe("video message routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.services.mockReturnValue({});
    mocks.appendVideoMessage.mockResolvedValue({ message, project: interviewingProject });
    mocks.listVideoMessages.mockResolvedValue([messageResponse]);
  });

  it("requires authentication on both message routes", async () => {
    expect((await send("POST", `/video-projects/${project.id}/messages`, { body: { content: "halo" } })).status).toBe(401);
    expect((await send("GET", `/video-projects/${project.id}/messages`)).status).toBe(401);
    expect(mocks.appendVideoMessage).not.toHaveBeenCalled();
    expect(mocks.listVideoMessages).not.toHaveBeenCalled();
  });

  it("rejects a message body that carries a client-owned field", async () => {
    for (const body of [{ content: "halo", role: "assistant" }, { content: "halo", user_id: user.id }]) {
      const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.appendVideoMessage).not.toHaveBeenCalled();
  });

  it("persists the first message scoped to the authenticated user and answers 201 with the interviewing project", async () => {
    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "buat video jualan" } });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ message: messageResponse, project: interviewingProject });
    expect(mocks.appendVideoMessage).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, content: "buat video jualan" }, expect.anything());
  });

  it("hides a message on another user's project behind a 404", async () => {
    mocks.appendVideoMessage.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });

  it("lists the persisted conversation for the project owner", async () => {
    const response = await send("GET", `/video-projects/${project.id}/messages`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ messages: [messageResponse] });
    expect(mocks.listVideoMessages).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });

  it("hides a conversation the caller does not own behind a 404", async () => {
    mocks.listVideoMessages.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("GET", `/video-projects/${project.id}/messages`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });
});
