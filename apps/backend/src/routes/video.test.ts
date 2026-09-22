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
  runVideoInterviewTurn: vi.fn(),
  listVideoMessages: vi.fn(),
  getLatestBriefRevision: vi.fn(),
  getLatestStoryboardRevision: vi.fn(),
  approveVideoProject: vi.fn(),
  createRenderJob: vi.fn(),
  getRenderJob: vi.fn(),
  cancelRenderJob: vi.fn(),
  listVideoRenderJobs: vi.fn(),
  listVideoVersions: vi.fn(),
  createVersionDownloadUrl: vi.fn(),
  services: vi.fn(),
  conversationServices: vi.fn(),
  approvalServices: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({ createSupabasePublicClient: mocks.publicClient, createSupabaseUserClient: mocks.userClient, createSupabaseServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/application/video/services", () => ({ createVideoProjectServices: mocks.services, createVideoConversationServices: mocks.conversationServices, createVideoApprovalServices: mocks.approvalServices }));
vi.mock("@/application/video/conversation", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/conversation")>("@/application/video/conversation");
  return { ...actual, runVideoInterviewTurn: mocks.runVideoInterviewTurn };
});
vi.mock("@/application/video/revisions", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/revisions")>("@/application/video/revisions");
  return { ...actual, getLatestBriefRevision: mocks.getLatestBriefRevision, getLatestStoryboardRevision: mocks.getLatestStoryboardRevision };
});
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
vi.mock("@/application/video/approval", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/approval")>("@/application/video/approval");
  return { ...actual, approveVideoProject: mocks.approveVideoProject };
});
vi.mock("@/application/video/render-jobs", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/render-jobs")>("@/application/video/render-jobs");
  return { ...actual, createRenderJob: mocks.createRenderJob, getRenderJob: mocks.getRenderJob, cancelRenderJob: mocks.cancelRenderJob, listVideoRenderJobs: mocks.listVideoRenderJobs };
});
vi.mock("@/application/video/versions", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/versions")>("@/application/video/versions");
  return { ...actual, listVideoVersions: mocks.listVideoVersions, createVersionDownloadUrl: mocks.createVersionDownloadUrl };
});

import { buildApprovalSnapshot } from "@/application/video/approval";
import { toRenderJobResponse } from "@/application/video/render-jobs";
import { AIError } from "@/domain/ai-service/errors";
import { VideoError } from "@/domain/video/errors";
import type { VideoOutputSettings, VideoRenderJob } from "@/domain/video/types";
import { createApp } from "@/app";

const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
const project = { id: "33333333-3333-4333-8333-333333333333", title: "Promo", videoType: "product_promo", styleId: "bold_pop", status: "draft", settings: {}, revisionRenderCount: 0, createdAt: "c", updatedAt: "u" };
const asset = { id: "22222222-2222-4222-8222-222222222222", projectId: project.id, objectKey: `video-projects/${project.id}/22222222-2222-4222-8222-222222222222.png`, mimeType: "image/png", byteSize: 68, sha256: "0".repeat(64), width: 2, height: 3, rightsConfirmedAt: "r", moderationStatus: "pending", createdAt: "c" };
const assetPreview = { id: asset.id, mimeType: "image/png", byteSize: asset.byteSize, width: 2, height: 3, moderationStatus: "pending", previewUrl: `https://signed.example/${asset.objectKey}` };
const pngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));
const message = { id: "message-1", projectId: project.id, userId: user.id, role: "user", content: "buat video jualan", controls: null, assetIds: [] as string[], createdAt: "c" };
const messageResponse = { id: message.id, role: "user", content: message.content, assetIds: message.assetIds, controls: null, createdAt: message.createdAt };
const reply = { ...message, id: "message-2", role: "assistant" as const, content: "Siapa target pembelinya?" };
const replyResponse = { id: reply.id, role: "assistant", content: reply.content, assetIds: reply.assetIds, controls: null, createdAt: reply.createdAt };
const briefRevisionResponse = { id: "44444444-4444-4444-8444-444444444444", version: 1, schemaVersion: "video-brief-draft@v1", isComplete: false, brief: { productName: null }, createdAt: "c" };
const storyboardRevisionResponse = { id: "55555555-5555-4555-8555-555555555555", version: 1, schemaVersion: "v1", briefRevisionId: briefRevisionResponse.id, scenes: [], totalDurationSeconds: 10, createdAt: "c" };
const interviewingProject = { ...project, status: "interviewing" };
const approvalSettings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };
const approvedProject = { ...project, status: "approved", settings: approvalSettings };
/** The row shape the use case returns, including the user id the route must strip. */
const approvedProjectRow = { ...approvedProject, userId: user.id };
const approvalSnapshot = buildApprovalSnapshot({
  project: { videoType: "product_promo", styleId: "bold_pop", settings: approvalSettings },
  briefRevision: { id: "44444444-4444-4444-8444-444444444444", version: 2 },
  storyboardRevision: { id: "55555555-5555-4555-8555-555555555555", version: 3 },
  generatedBy: { profileId: "primary", provider: "9router", model: "router-model", promptVersion: "planner-v1" },
  approvedAt: "2026-09-21T10:00:00.000Z",
});
const versionId = "88888888-8888-4888-8888-888888888888";
const renderJob: VideoRenderJob = { id: "66666666-6666-4666-8666-666666666666", projectId: project.id, userId: user.id, idempotencyKey: "render-0001", briefRevisionId: "44444444-4444-4444-8444-444444444444", storyboardRevisionId: "55555555-5555-4555-8555-555555555555", isRevision: false, inputSnapshot: { schemaVersion: "render-input@v1", variantSeed: "77777777-7777-4777-8777-777777777777" }, status: "queued", attempts: 0, queuedAt: "2026-09-21T00:00:00.000Z", createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" };
const versionResponse = { id: versionId, versionNumber: 2, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", createdAt: "2026-09-21T00:00:00.000Z", playbackUrl: `https://signed.example/video-versions/${project.id}/${versionId}.mp4` };

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
    mocks.conversationServices.mockReturnValue({});
    mocks.runVideoInterviewTurn.mockResolvedValue({ message, reply, project: interviewingProject });
    mocks.listVideoMessages.mockResolvedValue([messageResponse]);
  });

  it("requires authentication on both message routes", async () => {
    expect((await send("POST", `/video-projects/${project.id}/messages`, { body: { content: "halo" } })).status).toBe(401);
    expect((await send("GET", `/video-projects/${project.id}/messages`)).status).toBe(401);
    expect(mocks.runVideoInterviewTurn).not.toHaveBeenCalled();
    expect(mocks.listVideoMessages).not.toHaveBeenCalled();
  });

  it("rejects a message body that carries a client-owned field", async () => {
    for (const body of [{ content: "halo", role: "assistant" }, { content: "halo", user_id: user.id }]) {
      const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.runVideoInterviewTurn).not.toHaveBeenCalled();
  });

  it("runs one interview turn and answers 201 with the user message, the reply, and the project", async () => {
    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "buat video jualan" } });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ message: messageResponse, reply: replyResponse, project: interviewingProject });
    expect(mocks.runVideoInterviewTurn).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, content: "buat video jualan" }, expect.anything());
  });

  it("hides a message on another user's project behind a 404", async () => {
    mocks.runVideoInterviewTurn.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });

  it("maps an unusable provider answer to a normalized error", async () => {
    mocks.runVideoInterviewTurn.mockRejectedValue(new AIError({ code: "AI_UNAVAILABLE", safeMessage: "AI service is unavailable.", requestId: "request-1", retryable: true }));

    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "AI service is unavailable.", code: "AI_UNAVAILABLE", retryable: true });
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

describe("video revision read routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.services.mockReturnValue({});
    mocks.getLatestBriefRevision.mockResolvedValue(briefRevisionResponse);
    mocks.getLatestStoryboardRevision.mockResolvedValue(storyboardRevisionResponse);
  });

  it("requires authentication on both read routes", async () => {
    expect((await send("GET", `/video-projects/${project.id}/brief`)).status).toBe(401);
    expect((await send("GET", `/video-projects/${project.id}/storyboard`)).status).toBe(401);
    expect(mocks.getLatestBriefRevision).not.toHaveBeenCalled();
    expect(mocks.getLatestStoryboardRevision).not.toHaveBeenCalled();
  });

  it("returns the latest brief and storyboard for the owner", async () => {
    const briefResponse = await send("GET", `/video-projects/${project.id}/brief`, { token: "token" });
    const storyboardResponse = await send("GET", `/video-projects/${project.id}/storyboard`, { token: "token" });

    expect(briefResponse.status).toBe(200);
    await expect(briefResponse.json()).resolves.toEqual({ brief: briefRevisionResponse });
    await expect(storyboardResponse.json()).resolves.toEqual({ storyboard: storyboardRevisionResponse });
    expect(mocks.getLatestBriefRevision).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
    expect(mocks.getLatestStoryboardRevision).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });

  it("answers null rather than 404 before the interview produces a revision", async () => {
    mocks.getLatestBriefRevision.mockResolvedValue(null);
    mocks.getLatestStoryboardRevision.mockResolvedValue(null);

    await expect((await send("GET", `/video-projects/${project.id}/brief`, { token: "token" })).json()).resolves.toEqual({ brief: null });
    await expect((await send("GET", `/video-projects/${project.id}/storyboard`, { token: "token" })).json()).resolves.toEqual({ storyboard: null });
  });

  it("hides another user's project behind a 404", async () => {
    mocks.getLatestBriefRevision.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("GET", `/video-projects/${project.id}/brief`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });
});

describe("video approval route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.approvalServices.mockReturnValue({});
    mocks.approveVideoProject.mockResolvedValue({ project: approvedProjectRow, approval: approvalSnapshot });
  });

  it("requires authentication to approve", async () => {
    expect((await send("POST", `/video-projects/${project.id}/approve`)).status).toBe(401);
    expect(mocks.approveVideoProject).not.toHaveBeenCalled();
  });

  it("answers 409 with video_approval_incomplete for a brief or storyboard that cannot be approved", async () => {
    mocks.approveVideoProject.mockRejectedValue(new VideoError("video_approval_incomplete", "The brief is missing: callToAction."));

    const response = await send("POST", `/video-projects/${project.id}/approve`, { token: "token" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "The brief is missing: callToAction.", code: "video_approval_incomplete" });
  });

  it("answers 200 with the frozen snapshot and exposes no repository row or object key", async () => {
    const response = await send("POST", `/video-projects/${project.id}/approve`, { token: "token" });

    expect(response.status).toBe(200);
    const body = await response.json() as { project: typeof approvedProject; approval: typeof approvalSnapshot };
    expect(body).toEqual({ project: approvedProject, approval: approvalSnapshot });
    expect(Object.keys(body).sort()).toEqual(["approval", "project"]);
    expect(approvalSnapshot).toMatchObject({ schemaVersion: "video-approval@v1", storyboardRevisionId: "55555555-5555-4555-8555-555555555555" });
    expect(JSON.stringify(body)).not.toMatch(/userId|user_id|object_key|objectKey|approval_snapshot|scenes|generated_by/);
    expect(mocks.approveVideoProject).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });
});

describe("video render job routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.services.mockReturnValue({});
    mocks.createRenderJob.mockResolvedValue({ job: renderJob, created: true });
    mocks.getRenderJob.mockResolvedValue(renderJob);
    mocks.cancelRenderJob.mockResolvedValue({ ...renderJob, status: "cancelled" });
    mocks.listVideoRenderJobs.mockResolvedValue([toRenderJobResponse(renderJob)]);
    mocks.listVideoVersions.mockResolvedValue([versionResponse]);
    mocks.createVersionDownloadUrl.mockResolvedValue({ url: versionResponse.playbackUrl });
  });

  it("requires authentication on the render job and version routes", async () => {
    for (const [method, path] of [
      ["POST", `/video-projects/${project.id}/render-jobs`],
      ["GET", `/video-projects/${project.id}/render-jobs`],
      ["GET", `/video-projects/${project.id}/render-jobs/${renderJob.id}`],
      ["POST", `/video-projects/${project.id}/render-jobs/${renderJob.id}/cancel`],
      ["GET", `/video-projects/${project.id}/versions`],
      ["GET", `/video-projects/${project.id}/versions/${versionId}/download`],
    ] as const) {
      expect((await send(method, path)).status).toBe(401);
    }
    expect(mocks.createRenderJob).not.toHaveBeenCalled();
    expect(mocks.listVideoRenderJobs).not.toHaveBeenCalled();
    expect(mocks.listVideoVersions).not.toHaveBeenCalled();
  });

  it("lists the newest render job for the project, and an empty list when there is none", async () => {
    const response = await send("GET", `/video-projects/${project.id}/render-jobs`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ jobs: [toRenderJobResponse(renderJob)] });
    expect(mocks.listVideoRenderJobs).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());

    mocks.listVideoRenderJobs.mockResolvedValue([]);
    await expect((await send("GET", `/video-projects/${project.id}/render-jobs`, { token: "token" })).json()).resolves.toEqual({ jobs: [] });
  });

  it("rejects a render body that carries a client-owned field", async () => {
    for (const body of [{ idempotencyKey: "render-0001", userId: user.id }, { idempotencyKey: "render-0001", status: "queued" }]) {
      const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.createRenderJob).not.toHaveBeenCalled();
  });

  it("queues a render for the authenticated user and answers 201 with the projection", async () => {
    const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body: { idempotencyKey: "render-0001" } });

    expect(response.status).toBe(201);
    const body = await response.json() as { job: ReturnType<typeof toRenderJobResponse> };
    expect(body).toEqual({ job: toRenderJobResponse(renderJob) });
    expect(Object.keys(body.job).sort()).toEqual(["attempts", "createdAt", "id", "isRevision", "queuedAt", "status"]);
    expect(JSON.stringify(body)).not.toMatch(/inputSnapshot|idempotencyKey|userId|user_id|variantSeed/);
    expect(mocks.createRenderJob).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, idempotencyKey: "render-0001" }, expect.anything());
  });

  it("answers 200 with the same job for a repeated idempotency key", async () => {
    mocks.createRenderJob.mockResolvedValue({ job: renderJob, created: false });

    const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body: { idempotencyKey: "render-0001" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ job: { id: renderJob.id, status: "queued" } });
  });

  it("answers 409 with video_revision_quota_exhausted for a fourth rerender", async () => {
    mocks.createRenderJob.mockRejectedValue(new VideoError("video_revision_quota_exhausted", "This project has used all three rerenders."));

    const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body: { idempotencyKey: "render-0004" } });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This project has used all three rerenders.", code: "video_revision_quota_exhausted" });
  });

  it("reads one owned render job and hides another user's job behind a 404", async () => {
    const response = await send("GET", `/video-projects/${project.id}/render-jobs/${renderJob.id}`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ job: toRenderJobResponse(renderJob) });
    expect(mocks.getRenderJob).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, jobId: renderJob.id }, expect.anything());

    mocks.getRenderJob.mockRejectedValue(new VideoError("video_render_job_not_found", "The render job was not found."));
    const hidden = await send("GET", `/video-projects/${project.id}/render-jobs/${renderJob.id}`, { token: "token" });

    expect(hidden.status).toBe(404);
    await expect(hidden.json()).resolves.toEqual({ error: "The render job was not found.", code: "video_render_job_not_found" });
  });

  it("cancels a queued render and answers 409 once the worker started", async () => {
    const cancelled = await send("POST", `/video-projects/${project.id}/render-jobs/${renderJob.id}/cancel`, { token: "token" });

    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toMatchObject({ job: { id: renderJob.id, status: "cancelled" } });
    expect(mocks.cancelRenderJob).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, jobId: renderJob.id }, expect.anything());

    mocks.cancelRenderJob.mockRejectedValue(new VideoError("video_state_conflict", "This render has already started and cannot be cancelled."));
    const refused = await send("POST", `/video-projects/${project.id}/render-jobs/${renderJob.id}/cancel`, { token: "token" });

    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toEqual({ error: "This render has already started and cannot be cancelled.", code: "video_state_conflict" });
  });

  it("lists versions with signed playback urls and exposes no object key", async () => {
    const response = await send("GET", `/video-projects/${project.id}/versions`, { token: "token" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ versions: [versionResponse] });
    expect(JSON.stringify(body)).not.toMatch(/outputObjectKey|output_object_key|manifestHash/);
    expect(mocks.listVideoVersions).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });

  it("signs a version download for the authenticated owner only", async () => {
    const response = await send("GET", `/video-projects/${project.id}/versions/${versionId}/download`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: versionResponse.playbackUrl });
    expect(mocks.createVersionDownloadUrl).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, versionId }, expect.anything());
  });
});
