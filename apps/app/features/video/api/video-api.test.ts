import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), upload: vi.fn() }));

vi.mock("@/lib/api/browser-client", () => ({
  browserApiFetch: mocks.fetch,
  browserApiUpload: mocks.upload,
}));

import { videoApi } from "./video-api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("videoApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps project create, reads, and deletion to the backend contract", async () => {
    mocks.fetch.mockResolvedValue({ project: { id: "project-1" } });
    const idempotencyKey = "3d594650-3436-4a12-9a64-6f8e5c2f5f04";
    const input = {
      title: "Es Kopi",
      videoType: "product_promo" as const,
      styleId: "bold_pop" as const,
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

  it("maps asset, message, approval, and render mutations", async () => {
    mocks.fetch.mockResolvedValue({});
    mocks.upload.mockResolvedValue({ asset: { id: "asset-1" } });
    const file = new Uint8Array([1, 2]);

    await videoApi.uploadAsset("project-1", file, "image/webp");
    await videoApi.deleteAsset("project-1", "asset-1");
    await videoApi.sendMessage("project-1", "Halo", ["asset-1"]);
    await videoApi.approveProject("project-1");
    await videoApi.startRender("project-1", "3d594650-3436-4a12-9a64-6f8e5c2f5f04");
    await videoApi.cancelRender("project-1", "job-1");

    expect(mocks.upload).toHaveBeenCalledWith("/video-projects/project-1/assets", { body: file, contentType: "image/webp", signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/assets/asset-1", { method: "DELETE", signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/messages", { method: "POST", body: { content: "Halo", assetIds: ["asset-1"] }, signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/approve", { method: "POST", signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/render-jobs", { method: "POST", body: { idempotencyKey: "3d594650-3436-4a12-9a64-6f8e5c2f5f04" }, signal: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/render-jobs/job-1/cancel", { method: "POST", signal: undefined });
  });

  it("reads render jobs and versions together for one poll", async () => {
    const controller = new AbortController();
    mocks.fetch.mockResolvedValueOnce({ jobs: [{ id: "job-1" }] }).mockResolvedValueOnce({ versions: [{ id: "version-1" }] });

    await expect(videoApi.getRenderStatus("project-1", controller.signal)).resolves.toEqual({ jobs: [{ id: "job-1" }], versions: [{ id: "version-1" }] });
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, "/video-projects/project-1/render-jobs", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, "/video-projects/project-1/versions", { signal: controller.signal });
  });

  it("rejects the whole poll when either render read fails", async () => {
    mocks.fetch.mockResolvedValueOnce({ jobs: [] }).mockRejectedValueOnce(new Error("offline"));

    await expect(videoApi.getRenderStatus("project-1")).rejects.toThrow("offline");
  });

  it("starts all seven workspace reads before aggregating their DTOs", async () => {
    const controller = new AbortController();
    const project = deferred<{ project: { id: string } }>();
    const assets = deferred<{ assets: { id: string }[] }>();
    const messages = deferred<{ messages: { id: string }[] }>();
    const brief = deferred<{ brief: { id: string } }>();
    const storyboard = deferred<{ storyboard: { id: string } }>();
    const renderJobs = deferred<{ jobs: { id: string }[] }>();
    const versions = deferred<{ versions: { id: string }[] }>();
    const responses = [project, assets, messages, brief, storyboard, renderJobs, versions];
    mocks.fetch.mockImplementation(() => responses.shift()!.promise);

    const workspace = videoApi.loadVideoWorkspace("project-1", controller.signal);

    expect(mocks.fetch).toHaveBeenCalledTimes(7);
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/assets", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/messages", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/brief", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/storyboard", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/render-jobs", { signal: controller.signal });
    expect(mocks.fetch).toHaveBeenCalledWith("/video-projects/project-1/versions", { signal: controller.signal });
    project.resolve({ project: { id: "project-1" } });
    assets.resolve({ assets: [{ id: "asset-1" }] });
    messages.resolve({ messages: [{ id: "message-1" }] });
    brief.resolve({ brief: { id: "brief-1" } });
    storyboard.resolve({ storyboard: { id: "storyboard-1" } });
    renderJobs.resolve({ jobs: [{ id: "job-1" }] });
    versions.resolve({ versions: [{ id: "version-1" }] });

    await expect(workspace).resolves.toEqual({
      project: { id: "project-1" },
      assets: [{ id: "asset-1" }],
      messages: [{ id: "message-1" }],
      brief: { id: "brief-1" },
      storyboard: { id: "storyboard-1" },
      renderJobs: [{ id: "job-1" }],
      versions: [{ id: "version-1" }],
    });
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
