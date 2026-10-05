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
  openVideoInterview: vi.fn(),
  listVideoMessages: vi.fn(),
  getLatestBriefRevision: vi.fn(),
  getRenderJob: vi.fn(),
  cancelRenderJob: vi.fn(),
  getLatestRenderJob: vi.fn(),
  listCompositionRevisions: vi.fn(),
  getLatestComposition: vi.fn(),
  runComposition: vi.fn(),
  queueRenderJob: vi.fn(),
  listVideoVersions: vi.fn(),
  createVersionDownloadUrl: vi.fn(),
  services: vi.fn(),
  conversationServices: vi.fn(),
  composeServices: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({ createSupabasePublicClient: mocks.publicClient, createSupabaseUserClient: mocks.userClient, createSupabaseServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/application/video/services", () => ({ createVideoProjectServices: mocks.services, createVideoConversationServices: mocks.conversationServices, createComposeServices: mocks.composeServices }));
vi.mock("@/application/video/conversation", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/conversation")>("@/application/video/conversation");
  return { ...actual, runVideoInterviewTurn: mocks.runVideoInterviewTurn };
});
vi.mock("@/application/video/open-interview", () => ({ openVideoInterview: mocks.openVideoInterview }));
vi.mock("@/application/video/revisions", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/revisions")>("@/application/video/revisions");
  return { ...actual, getLatestBriefRevision: mocks.getLatestBriefRevision };
});
vi.mock("@/application/video/projects", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/projects")>("@/application/video/projects");
  return { ...actual, listVideoProjects: mocks.listVideoProjects, getVideoProject: mocks.getVideoProject, deleteVideoProject: mocks.deleteVideoProject };
});
vi.mock("@/application/video/create-video-project", () => ({ createVideoProject: mocks.createVideoProject }));
vi.mock("@/application/video/assets", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/assets")>("@/application/video/assets");
  return { ...actual, registerProjectAsset: mocks.registerProjectAsset, deleteProjectAsset: mocks.deleteProjectAsset, listProjectAssets: mocks.listProjectAssets };
});
vi.mock("@/application/video/messages", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/messages")>("@/application/video/messages");
  return { ...actual, appendVideoMessage: mocks.appendVideoMessage, listVideoMessages: mocks.listVideoMessages };
});
vi.mock("@/application/video/compositions", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/compositions")>("@/application/video/compositions");
  return {
    ...actual,
    getRenderJob: mocks.getRenderJob,
    cancelRenderJob: mocks.cancelRenderJob,
    getLatestRenderJob: mocks.getLatestRenderJob,
    listCompositionRevisions: mocks.listCompositionRevisions,
    getLatestComposition: mocks.getLatestComposition,
  };
});
vi.mock("@/application/video-engine/compose", async () => {
  const actual = await vi.importActual<typeof import("@/application/video-engine/compose")>("@/application/video-engine/compose");
  return { ...actual, runComposition: mocks.runComposition };
});
vi.mock("@/application/video-engine/queue-render-job", async () => {
  const actual = await vi.importActual<typeof import("@/application/video-engine/queue-render-job")>("@/application/video-engine/queue-render-job");
  return { ...actual, queueRenderJob: mocks.queueRenderJob };
});
vi.mock("@/application/video/versions", async () => {
  const actual = await vi.importActual<typeof import("@/application/video/versions")>("@/application/video/versions");
  return { ...actual, listVideoVersions: mocks.listVideoVersions, createVersionDownloadUrl: mocks.createVersionDownloadUrl };
});

import { toRenderJobResponse } from "@/application/video/compositions";
import { AIError } from "@/domain/ai-service/errors";
import { VideoError } from "@/domain/video/errors";
import type { RenderJob } from "@/domain/video-engine/contracts";
import { createApp } from "@/app";

const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
const project = { id: "33333333-3333-4333-8333-333333333333", title: "Promo", videoType: "product_promo", styleId: "creative-mode", status: "draft", settings: {}, revisionRenderCount: 0, createdAt: "c", updatedAt: "u" };
const asset = { id: "22222222-2222-4222-8222-222222222222", projectId: project.id, objectKey: `video-projects/${project.id}/22222222-2222-4222-8222-222222222222.png`, mimeType: "image/png", byteSize: 68, sha256: "0".repeat(64), width: 2, height: 3, rightsConfirmedAt: "r", moderationStatus: "pending", createdAt: "c" };
const assetPreview = { id: asset.id, mimeType: "image/png", byteSize: asset.byteSize, width: 2, height: 3, moderationStatus: "pending", previewUrl: `https://signed.example/${asset.objectKey}` };
const pngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));
const message = { id: "message-1", projectId: project.id, userId: user.id, role: "user", content: "buat video jualan", controls: null, assetIds: [] as string[], createdAt: "c" };
const messageResponse = { id: message.id, role: "user", content: message.content, assetIds: message.assetIds, controls: null, createdAt: message.createdAt };
const reply = { ...message, id: "message-2", role: "assistant" as const, content: "Siapa target pembelinya?" };
const replyResponse = { id: reply.id, role: "assistant", content: reply.content, assetIds: reply.assetIds, controls: null, createdAt: reply.createdAt };
const briefRevisionResponse = { id: "44444444-4444-4444-8444-444444444444", version: 1, schemaVersion: "video-brief-draft@v1", isComplete: false, brief: { productName: null }, createdAt: "c" };
const interviewingProject = { ...project, status: "interviewing" };
const compositionRevisionId = "55555555-5555-4555-8555-555555555555";
const compositionResponse = { id: compositionRevisionId, version: 1, schemaVersion: "composition-spec@v1", designPack: { id: "creative-mode", version: "1" }, isFallback: false, validationIssues: [], candidates: [], spec: { scenes: [] }, createdAt: "c", previewReady: false, latestJob: null };
const versionId = "88888888-8888-4888-8888-888888888888";
const renderJob: RenderJob = { id: "66666666-6666-4666-8666-666666666666", projectId: project.id, userId: user.id, idempotencyKey: "render-0001", compositionArtifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "preview", isRevision: false, inputSnapshot: { compositionHash: "a".repeat(64), width: 1080, height: 1920, fps: 30, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p" }, status: "queued", attempts: 0, queuedAt: "2026-09-21T00:00:00.000Z", createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" };
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
    mocks.createVideoProject.mockResolvedValue({ project, created: true });
    mocks.listVideoProjects.mockResolvedValue([project]);
    mocks.getVideoProject.mockResolvedValue(project);
    mocks.deleteVideoProject.mockResolvedValue({ pendingObjectDeletions: 0 });
    mocks.registerProjectAsset.mockResolvedValue(asset);
    mocks.deleteProjectAsset.mockResolvedValue(undefined);
    mocks.listProjectAssets.mockResolvedValue([assetPreview]);
  });

  it("opens an authenticated conversation with a persisted assistant message", async () => {
    mocks.openVideoInterview.mockResolvedValue([reply]);
    const response = await send("POST", `/video-projects/${project.id}/messages/opening`, { token: "token" });
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(`event: completed\ndata: ${JSON.stringify({ messages: [replyResponse] })}\n\n`);
  });

  it("requires authentication before opening a conversation", async () => {
    const response = await send("POST", `/video-projects/${project.id}/messages/opening`);
    expect(response.status).toBe(401);
    expect(mocks.openVideoInterview).not.toHaveBeenCalled();
  });

  it("requires authentication on every route", async () => {
    for (const [method, path] of [["POST", "/video-projects"], ["GET", "/video-projects"], ["GET", `/video-projects/${project.id}`], ["DELETE", `/video-projects/${project.id}`], ["POST", `/video-projects/${project.id}/assets`], ["GET", `/video-projects/${project.id}/assets`], ["DELETE", `/video-projects/${project.id}/assets/${asset.id}`]] as const) {
      expect((await send(method, path)).status).toBe(401);
    }
    expect(mocks.createVideoProject).not.toHaveBeenCalled();
    expect(mocks.registerProjectAsset).not.toHaveBeenCalled();
  });

  it("creates a project scoped to the authenticated user and answers 201", async () => {
    const response = await send("POST", "/video-projects", { token: "token", body: { idempotencyKey: "44444444-4444-4444-8444-444444444444", title: "Promo", videoType: "product_promo", styleId: "creative-mode", settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true } } });

    expect(response.status).toBe(201);
    expect(mocks.createVideoProject).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), expect.anything());
    const responseBody = await response.json();
    expect(responseBody).toEqual({ project });
    expect(JSON.stringify(responseBody)).not.toMatch(/idempotencyKey|idempotency_key/);
  });

  it("answers 200 with the existing project for a repeated idempotency key", async () => {
    mocks.createVideoProject.mockResolvedValue({ project, created: false });

    const response = await send("POST", "/video-projects", { token: "token", body: { idempotencyKey: "44444444-4444-4444-8444-444444444444", title: "Promo", videoType: "product_promo", styleId: "creative-mode", settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true } } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ project });
  });

  it("rejects a body that carries a client-owned field", async () => {
    const response = await send("POST", "/video-projects", { token: "token", body: { title: "Promo", videoType: "product_promo", styleId: "creative-mode", status: "approved", settings: {} } });

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

  it("rejects an upload with an incomplete request body", async () => {
    const response = await send("POST", `/video-projects/${project.id}/assets`, {
      token: "token",
      headers: { "content-type": "image/png", "content-length": String(pngBytes.length + 1), "x-asset-rights-confirmed": "true" },
      assetBytes: pngBytes,
    });

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

  it("completes the stream with persisted public message and project DTOs", async () => {
    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "buat video jualan" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    await expect(response.text()).resolves.toBe(`event: completed\ndata: ${JSON.stringify({ message: messageResponse, reply: replyResponse, project: interviewingProject })}\n\n`);
  });

  it("publishes saved-user acknowledgement and provisional text before completion", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    mocks.runVideoInterviewTurn.mockImplementationOnce(async (_command, _dependencies, options) => {
      options.onMessagePersisted({ message, project: interviewingProject });
      options.onQuestionDelta("Siapa ");
      await gate;
      return { message, reply, project: interviewingProject };
    });
    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe(`event: message\ndata: ${JSON.stringify({ message: messageResponse, project: interviewingProject })}\n\n`);
    expect(decoder.decode((await reader.read()).value)).toBe('event: text-delta\ndata: {"delta":"Siapa "}\n\n');
    finish();
    expect(decoder.decode((await reader.read()).value)).toContain("event: completed");
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
  });

  it("keeps opening uncommitted until its first fragment", async () => {
    let publish!: () => void;
    let finish!: () => void;
    const started = new Promise<void>((resolve) => {
      mocks.openVideoInterview.mockImplementationOnce(async (_command, _dependencies, options) => {
        publish = () => options.onQuestionDelta("Apa ");
        resolve();
        await new Promise<void>((done) => { finish = done; });
        return [reply];
      });
    });
    let received = false;
    const pending = send("POST", `/video-projects/${project.id}/messages/opening`, { token: "token" }).then((response) => { received = true; return response; });
    await started;
    expect(received).toBe(false);
    publish();
    const response = await pending;
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"delta":"Apa "');
    finish();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: completed");
    await reader.cancel();
    reader.releaseLock();
  });

  it("maps a late provider failure into one safe terminal error", async () => {
    mocks.runVideoInterviewTurn.mockImplementationOnce(async (_command, _dependencies, options) => {
      options.onMessagePersisted({ message, project: interviewingProject });
      options.onQuestionDelta("Preview");
      throw new AIError({ code: "AI_UNAVAILABLE", safeMessage: "AI provider is unavailable.", requestId: "req", retryable: false });
    });
    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.match(/event: error/g)).toHaveLength(1);
    expect(text).toContain('"status":503');
    expect(text).not.toContain("event: completed");
    expect(text).not.toMatch(/userId|projectId|apiKey/);
  });

  it("cancels application generation when the response reader disconnects", async () => {
    let signal!: AbortSignal;
    mocks.runVideoInterviewTurn.mockImplementationOnce(async (_command, _dependencies, options) => {
      signal = options.abortSignal;
      options.onMessagePersisted({ message, project: interviewingProject });
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("private upstream details");
    });
    const response = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });
    await response.body!.cancel();
    expect(signal.aborted).toBe(true);
  });

  it("hides unknown failures before and after stream commitment", async () => {
    mocks.runVideoInterviewTurn.mockRejectedValueOnce(new Error("private upstream details"));
    const rejected = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });
    expect(rejected.status).toBe(500);
    await expect(rejected.json()).resolves.toEqual({ error: "Internal server error." });
    mocks.runVideoInterviewTurn.mockImplementationOnce(async (_command, _dependencies, options) => {
      options.onMessagePersisted({ message, project: interviewingProject });
      throw new Error("private upstream details");
    });
    const accepted = await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "halo" } });
    const text = await accepted.text();
    expect(text).toContain('"status":500,"error":"Internal server error."');
    expect(text).not.toContain("private");
  });

  it("does not log message content", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await send("POST", `/video-projects/${project.id}/messages`, { token: "token", body: { content: "private campaign details" } });

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
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
  });

  it("requires authentication on the brief read", async () => {
    expect((await send("GET", `/video-projects/${project.id}/brief`)).status).toBe(401);
    expect(mocks.getLatestBriefRevision).not.toHaveBeenCalled();
  });

  it("returns the latest brief for the owner", async () => {
    const response = await send("GET", `/video-projects/${project.id}/brief`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ brief: briefRevisionResponse });
    expect(mocks.getLatestBriefRevision).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });

  it("answers null rather than 404 before the interview produces a revision", async () => {
    mocks.getLatestBriefRevision.mockResolvedValue(null);

    await expect((await send("GET", `/video-projects/${project.id}/brief`, { token: "token" })).json()).resolves.toEqual({ brief: null });
  });

  it("hides another user's project behind a 404", async () => {
    mocks.getLatestBriefRevision.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("GET", `/video-projects/${project.id}/brief`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });
});

describe("video composition routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.services.mockReturnValue({});
    mocks.composeServices.mockReturnValue({});
    mocks.runComposition.mockResolvedValue({
      compositionRevisionId,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      compositionHash: "a".repeat(64),
      isFallback: false,
      validationIssues: [],
    });
    mocks.listCompositionRevisions.mockResolvedValue([compositionResponse]);
    mocks.getLatestComposition.mockResolvedValue(compositionResponse);
  });

  it("requires authentication on every composition route", async () => {
    for (const [method, path] of [
      ["POST", `/video-projects/${project.id}/compositions`],
      ["GET", `/video-projects/${project.id}/compositions`],
      ["GET", `/video-projects/${project.id}/compositions/latest`],
    ] as const) {
      expect((await send(method, path)).status).toBe(401);
    }
    expect(mocks.runComposition).not.toHaveBeenCalled();
    expect(mocks.listCompositionRevisions).not.toHaveBeenCalled();
  });

  it("plans, compiles, and answers 201 with the revision the user must approve", async () => {
    const response = await send("POST", `/video-projects/${project.id}/compositions`, { token: "token" });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      composition: {
        id: compositionRevisionId,
        compositionHash: "a".repeat(64),
        isFallback: false,
        validationIssues: [],
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/userId|user_id|artifactPrefix|artifact_prefix|objectKey|object_key|idempotency/);
    expect(mocks.runComposition).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });

  it("answers 409 while the brief is incomplete", async () => {
    mocks.runComposition.mockRejectedValue(new VideoError("video_approval_incomplete", "The brief is not complete yet."));

    const response = await send("POST", `/video-projects/${project.id}/compositions`, { token: "token" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "The brief is not complete yet.", code: "video_approval_incomplete" });
  });

  it("lists the composition revisions and answers null before the first plan", async () => {
    const listed = await send("GET", `/video-projects/${project.id}/compositions`, { token: "token" });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({ compositions: [compositionResponse] });
    expect(mocks.listCompositionRevisions).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, limit: 20 }, expect.anything());

    mocks.getLatestComposition.mockResolvedValue(null);
    await expect((await send("GET", `/video-projects/${project.id}/compositions/latest`, { token: "token" })).json()).resolves.toEqual({ composition: null });
  });

  it("hides another user's project behind a 404", async () => {
    mocks.getLatestComposition.mockRejectedValue(new VideoError("video_project_not_found", "The video project was not found."));

    const response = await send("GET", `/video-projects/${project.id}/compositions/latest`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video project was not found.", code: "video_project_not_found" });
  });
});

describe("video render job routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.services.mockReturnValue({});
    mocks.queueRenderJob.mockResolvedValue({ job: renderJob, created: true });
    mocks.getRenderJob.mockResolvedValue(renderJob);
    mocks.cancelRenderJob.mockResolvedValue({ ...renderJob, status: "cancelled" });
    mocks.getLatestRenderJob.mockResolvedValue(renderJob);
    mocks.listVideoVersions.mockResolvedValue([versionResponse]);
    mocks.createVersionDownloadUrl.mockResolvedValue({ url: versionResponse.playbackUrl });
  });

  it("requires authentication on the render job and version routes", async () => {
    for (const [method, path] of [
      ["POST", `/video-projects/${project.id}/render-jobs`],
      ["GET", `/video-projects/${project.id}/render-jobs/latest`],
      ["GET", `/video-projects/${project.id}/render-jobs/${renderJob.id}`],
      ["POST", `/video-projects/${project.id}/render-jobs/${renderJob.id}/cancel`],
      ["GET", `/video-projects/${project.id}/versions`],
      ["GET", `/video-projects/${project.id}/versions/${versionId}/download`],
    ] as const) {
      expect((await send(method, path)).status).toBe(401);
    }
    expect(mocks.queueRenderJob).not.toHaveBeenCalled();
    expect(mocks.getLatestRenderJob).not.toHaveBeenCalled();
    expect(mocks.listVideoVersions).not.toHaveBeenCalled();
  });

  it("reads the newest render job for the project, and null when there is none", async () => {
    const response = await send("GET", `/video-projects/${project.id}/render-jobs/latest`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ job: toRenderJobResponse(renderJob) });
    expect(mocks.getLatestRenderJob).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());

    mocks.getLatestRenderJob.mockResolvedValue(null);
    await expect((await send("GET", `/video-projects/${project.id}/render-jobs/latest`, { token: "token" })).json()).resolves.toEqual({ job: null });
  });

  it("rejects a render body that carries a client-owned field", async () => {
    for (const body of [{ idempotencyKey: "render-0001", compositionRevisionId, kind: "preview", userId: user.id }, { idempotencyKey: "render-0001", compositionRevisionId, kind: "preview", status: "queued" }]) {
      const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    }
    expect(mocks.queueRenderJob).not.toHaveBeenCalled();
  });

  it("queues a render for the authenticated user and answers 201 with the projection", async () => {
    const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body: { idempotencyKey: "render-0001", compositionRevisionId, kind: "preview" } });

    expect(response.status).toBe(201);
    const body = await response.json() as { job: ReturnType<typeof toRenderJobResponse> };
    expect(body).toEqual({ job: toRenderJobResponse(renderJob) });
    expect(Object.keys(body.job).sort()).toEqual(["attempts", "id", "isRevision", "kind", "queuedAt", "status"]);
    expect(JSON.stringify(body)).not.toMatch(/inputSnapshot|idempotencyKey|userId|user_id|compositionArtifactId|compositionHash/);
    expect(mocks.queueRenderJob).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, compositionRevisionId, kind: "preview", idempotencyKey: "render-0001" }, expect.anything());
  });

  it("answers 200 with the same job for a repeated idempotency key", async () => {
    mocks.queueRenderJob.mockResolvedValue({ job: renderJob, created: false });

    const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body: { idempotencyKey: "render-0001", compositionRevisionId, kind: "preview" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ job: { id: renderJob.id, status: "queued" } });
  });

  it("answers 409 with video_revision_quota_exhausted for a fourth rerender", async () => {
    mocks.queueRenderJob.mockRejectedValue(new VideoError("video_revision_quota_exhausted", "This project has used all three rerenders."));

    const response = await send("POST", `/video-projects/${project.id}/render-jobs`, { token: "token", body: { idempotencyKey: "render-0004", compositionRevisionId, kind: "final" } });

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
    expect(JSON.stringify(body)).not.toMatch(/outputObjectKey|output_object_key|compositionHash/);
    expect(mocks.listVideoVersions).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id }, expect.anything());
  });

  it("signs a version download for the authenticated owner only", async () => {
    const response = await send("GET", `/video-projects/${project.id}/versions/${versionId}/download`, { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: versionResponse.playbackUrl });
    expect(mocks.createVersionDownloadUrl).toHaveBeenCalledWith({ userId: "user-1", projectId: project.id, versionId }, expect.anything());
  });

  it("hides another user's version download behind a safe 404", async () => {
    mocks.createVersionDownloadUrl.mockRejectedValue(new VideoError("video_version_not_found", "The video version was not found."));

    const response = await send("GET", `/video-projects/${project.id}/versions/${versionId}/download`, { token: "token" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "The video version was not found.", code: "video_version_not_found" });
  });
});
