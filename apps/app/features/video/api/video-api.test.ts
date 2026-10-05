import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMessage, VideoProject } from "@/domain/video/types";
import type { BrowserApiOptions, BrowserStreamEvent } from "@/lib/api/browser-client";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  upload: vi.fn(),
  stream: vi.fn<(path: string, options: BrowserApiOptions & { onEvent?: (event: BrowserStreamEvent) => void }) => Promise<unknown>>(),
}));

vi.mock("@/lib/api/browser-client", () => ({
  browserApiFetch: mocks.fetch,
  browserApiUpload: mocks.upload,
  browserApiStream: mocks.stream,
}));

import { videoApi } from "./video-api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const project: VideoProject = {
  id: "project-1",
  title: "Es Kopi",
  videoType: "product_promo",
  styleId: "creative-mode",
  status: "interviewing",
  settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
  revisionRenderCount: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const userMessage: VideoMessage = {
  id: "user-1", role: "user", content: "Es kopi susu", assetIds: [], controls: null, createdAt: "2026-10-01T00:00:00Z",
};
const assistantMessage: VideoMessage = {
  id: "assistant-1", role: "assistant", content: "Siapa target pembelinya?", assetIds: [],
  controls: {
    question: "Siapa target pembelinya?", control: "single_select", options: [{ id: "students", label: "Mahasiswa", detail: null }],
    recommendedOptionId: "students", recommendationReason: "Harga terjangkau", targetFields: ["audience"], briefComplete: false,
  },
  createdAt: "2026-10-01T00:00:01Z",
};
const sendResult = { message: userMessage, reply: assistantMessage, project };

function deliverEvents(events: BrowserStreamEvent[]) {
  mocks.stream.mockImplementation(async (_path, options) => {
    for (const event of events) options.onEvent?.(event);
    return events.find((event) => event.event === "completed")?.data;
  });
}

describe("videoApi", () => {
  beforeEach(() => vi.resetAllMocks());

  it("maps project create, reads, and deletion to the backend contract", async () => {
    mocks.fetch.mockResolvedValue({ project: { id: "project-1" } });
    const idempotencyKey = "3d594650-3436-4a12-9a64-6f8e5c2f5f04";
    const input = {
      title: "Es Kopi",
      videoType: "product_promo" as const,
      styleId: "creative-mode" as const,
      settings: { durationSeconds: 10 as const, aspectRatio: "9:16" as const, resolution: "1080p" as const, language: "id", voiceOverEnabled: true, musicEnabled: false },
    };

    await videoApi.createProject(input, idempotencyKey);
    await videoApi.listProjects();
    await videoApi.getProject("project/id");
    await videoApi.deleteProject("project/id");

    expect(mocks.fetch).toHaveBeenNthCalledWith(1, "/video-projects", { method: "POST", body: { ...input, idempotencyKey }, signal: undefined });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, "/video-projects", { signal: undefined });
    expect(mocks.fetch).toHaveBeenNthCalledWith(3, "/video-projects/project%2Fid", { signal: undefined });
    expect(mocks.fetch).toHaveBeenNthCalledWith(4, "/video-projects/project%2Fid", { method: "DELETE", signal: undefined });
  });

  it("maps asset, composition, and render mutations", async () => {
    mocks.fetch.mockResolvedValue({});
    mocks.upload.mockResolvedValue({ asset: { id: "asset-1" } });
    const file = new Uint8Array([1, 2]);

    await videoApi.uploadAsset("project-1", file, "image/webp");
    await videoApi.deleteAsset("project-1", "asset-1");
    await videoApi.createComposition("project-1");
    await videoApi.startRender("project-1", { idempotencyKey: "3d594650-3436-4a12-9a64-6f8e5c2f5f04", compositionRevisionId: "composition-1", kind: "preview" });
    await videoApi.cancelRender("project-1", "job-1");

    expect(mocks.upload).toHaveBeenCalledWith("/video-projects/project-1/assets", { body: file, contentType: "image/webp", signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/assets/asset-1", { method: "DELETE", signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/compositions", { method: "POST", signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/render-jobs", {
      method: "POST",
      body: { idempotencyKey: "3d594650-3436-4a12-9a64-6f8e5c2f5f04", compositionRevisionId: "composition-1", kind: "preview" },
      signal: undefined,
    });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/render-jobs/job-1/cancel", { method: "POST", signal: undefined });
  });

  it("reads the latest render job and the versions together for one poll", async () => {
    const controller = new AbortController();
    mocks.fetch.mockResolvedValueOnce({ job: { id: "job-1" } }).mockResolvedValueOnce({ versions: [{ id: "version-1" }] });

    await expect(videoApi.getRenderStatus("project-1", controller.signal)).resolves.toEqual({ job: { id: "job-1" }, versions: [{ id: "version-1" }] });
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, "/video-projects/project-1/render-jobs/latest", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, "/video-projects/project-1/versions", { signal: controller.signal });
  });

  it("rejects the whole poll when either render read fails", async () => {
    mocks.fetch.mockResolvedValueOnce({ job: null }).mockRejectedValueOnce(new Error("offline"));

    await expect(videoApi.getRenderStatus("project-1")).rejects.toThrow("offline");
  });

  it("starts all seven workspace reads before aggregating their DTOs", async () => {
    const controller = new AbortController();
    const project = deferred<{ project: { id: string } }>();
    const assets = deferred<{ assets: { id: string }[] }>();
    const messages = deferred<{ messages: { id: string }[] }>();
    const brief = deferred<{ brief: { id: string } }>();
    const composition = deferred<{ composition: { id: string } }>();
    const renderJob = deferred<{ job: { id: string } }>();
    const versions = deferred<{ versions: { id: string }[] }>();
    const responses = [project, assets, messages, brief, composition, renderJob, versions];
    mocks.fetch.mockImplementation(() => responses.shift()!.promise);

    const workspace = videoApi.loadVideoWorkspace("project-1", controller.signal);

    expect(mocks.fetch).toHaveBeenCalledTimes(7);
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/assets", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/messages", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/brief", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/compositions/latest", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/render-jobs/latest", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/versions", { signal: controller.signal });
    project.resolve({ project: { id: "project-1" } });
    assets.resolve({ assets: [{ id: "asset-1" }] });
    messages.resolve({ messages: [{ id: "message-1" }] });
    brief.resolve({ brief: { id: "brief-1" } });
    composition.resolve({ composition: { id: "composition-1" } });
    renderJob.resolve({ job: { id: "job-1" } });
    versions.resolve({ versions: [{ id: "version-1" }] });

    await expect(workspace).resolves.toEqual({
      project: { id: "project-1" },
      assets: [{ id: "asset-1" }],
      messages: [{ id: "message-1" }],
      brief: { id: "brief-1" },
      composition: { id: "composition-1" },
      renderJob: { id: "job-1" },
      versions: [{ id: "version-1" }],
    });
  });

  it("publishes a provisional question while completion is pending, then returns only the saved final reply", async () => {
    const release = deferred<void>();
    const previewReceived = deferred<void>();
    const received: string[] = [];
    let settled = false;
    mocks.stream.mockImplementation(async (_path, options) => {
      options.onEvent?.({ event: "message", data: { message: userMessage, project } });
      options.onEvent?.({ event: "text-delta", data: { delta: "Siapa yang " } });
      previewReceived.resolve();
      await release.promise;
      options.onEvent?.({ event: "completed", data: sendResult });
      return sendResult;
    });

    const send = videoApi.sendMessage("project-1", userMessage.content, undefined, {
      onTextDelta: (delta) => received.push(delta),
    }).then((result) => { settled = true; return result; });
    await previewReceived.promise;
    expect(received).toEqual(["Siapa yang "]);
    expect(settled).toBe(false);
    release.resolve();
    const result = await send;
    expect(result.reply.content).toBe("Siapa target pembelinya?");
    expect(result.reply.controls?.options).toEqual([{ id: "students", label: "Mahasiswa", detail: null }]);
  });

  it.each([
    { event: "message", data: { message: { ...userMessage, role: "assistant" }, project } },
    { event: "message", data: { message: { ...userMessage, controls: assistantMessage.controls }, project } },
    { event: "message", data: { message: userMessage, project: { ...project, settings: { ...project.settings, musicEnabled: "false" } } } },
    { event: "text-delta", data: { delta: 123 } },
  ])("rejects malformed $event data before publishing it", async (event) => {
    const onMessagePersisted = vi.fn();
    const onTextDelta = vi.fn();
    deliverEvents([event, { event: "completed", data: sendResult }]);

    await expect(videoApi.sendMessage("project-1", "Halo", undefined, { onMessagePersisted, onTextDelta }))
      .rejects.toThrow("Invalid video chat response.");
    expect(onMessagePersisted).not.toHaveBeenCalled();
    expect(onTextDelta).not.toHaveBeenCalled();
  });

  it("validates acknowledgements even when no persistence callback is registered", async () => {
    deliverEvents([{ event: "message", data: { message: userMessage, project: null } }, { event: "completed", data: sendResult }]);
    await expect(videoApi.sendMessage("project-1", "Halo")).rejects.toThrow("Invalid video chat response.");
  });

  it.each([
    { ...sendResult, reply: { ...assistantMessage, role: "user" } },
    { ...sendResult, reply: { ...assistantMessage, controls: { ...assistantMessage.controls, options: [{ id: "students" }] } } },
    { ...sendResult, message: { ...userMessage, assetIds: [42] } },
    { ...sendResult, project: { ...project, status: "unknown" } },
    { messages: [assistantMessage] },
  ])("rejects an invalid send completion instead of returning unsafe workspace data", async (data) => {
    deliverEvents([{ event: "completed", data }]);
    await expect(videoApi.sendMessage("project-1", "Halo")).rejects.toThrow("Invalid video chat response.");
  });

  it("strips fields outside the DTO before an acknowledgement or final result reaches the workspace", async () => {
    const message = { ...userMessage, userId: "private-owner" };
    const publicProject = { ...project, providerKey: "private-key" };
    const onMessagePersisted = vi.fn();
    deliverEvents([
      { event: "message", data: { message, project: publicProject, draft: { audience: "private" } } },
      { event: "completed", data: { ...sendResult, message, project: publicProject, rawProviderResponse: "private" } },
    ]);

    const result = await videoApi.sendMessage("project-1", "Halo", undefined, { onMessagePersisted });
    expect(onMessagePersisted).toHaveBeenCalledWith({ message: userMessage, project });
    expect(result).toEqual(sendResult);
  });

  it("accepts the actual saved opening transcript without requiring a preview or limiting it to assistant messages", async () => {
    deliverEvents([{ event: "completed", data: { messages: [assistantMessage, userMessage], draft: "private" } }]);
    const result = await videoApi.openInterview("project-1", { signal: new AbortController().signal });
    expect(result).toEqual({ messages: [assistantMessage, userMessage] });
  });

  it.each([
    { event: "message", data: { message: userMessage, project } },
    { event: "completed", data: { messages: [{ ...assistantMessage, role: "system" }] } },
    { event: "completed", data: { messages: [{ ...userMessage, controls: assistantMessage.controls }] } },
    { event: "completed", data: sendResult },
  ])("rejects $event when it violates the opening contract", async (event) => {
    const onMessagePersisted = vi.fn();
    deliverEvents([event]);
    await expect(videoApi.openInterview("project-1", { onMessagePersisted })).rejects.toThrow("Invalid video chat response.");
    expect(onMessagePersisted).not.toHaveBeenCalled();
  });

  it("does not treat transport resolution without a validated completion as success", async () => {
    mocks.stream.mockResolvedValue(sendResult);
    await expect(videoApi.sendMessage("project-1", "Halo")).rejects.toThrow("Invalid video chat response.");
    await expect(videoApi.openInterview("project-1")).rejects.toThrow("Invalid video chat response.");
  });

  it("validates an https download URL before navigating without adding the access token", async () => {
    mocks.fetch.mockResolvedValue({ url: "https://storage.visuala.test/version.mp4?signature=signed" });
    vi.stubGlobal("window", { location: { href: "" } });

    await videoApi.downloadVersion("project-1", "version-1");

    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/versions/version-1/download", { signal: undefined });
    expect(window.location.href).toBe("https://storage.visuala.test/version.mp4?signature=signed");
  });

  it("rejects malformed and non-loopback HTTP download URLs", async () => {
    mocks.fetch
      .mockResolvedValueOnce({ url: "not-a-url" })
      .mockResolvedValueOnce({ url: "http://storage.visuala.test/version.mp4" });

    await expect(videoApi.downloadVersion("project-1", "version-1")).rejects.toThrow("Invalid download URL.");
    await expect(videoApi.downloadVersion("project-1", "version-1")).rejects.toThrow("Invalid download URL.");
  });

  it("allows loopback HTTP downloads only in an explicit development environment", async () => {
    mocks.fetch.mockResolvedValue({ url: "http://localhost:4000/version.mp4" });
    vi.stubGlobal("window", { location: { href: "" } });
    vi.stubEnv("NODE_ENV", "production");

    await expect(videoApi.downloadVersion("project-1", "version-1")).rejects.toThrow("Invalid download URL.");

    vi.stubEnv("NODE_ENV", "development");
    await videoApi.downloadVersion("project-1", "version-1");
    expect(window.location.href).toBe("http://localhost:4000/version.mp4");
  });
});
