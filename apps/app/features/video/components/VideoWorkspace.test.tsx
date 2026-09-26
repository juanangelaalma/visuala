// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadVideoWorkspace: vi.fn(),
  sendMessage: vi.fn(),
  openInterview: vi.fn(),
  approveProject: vi.fn(),
  deleteAsset: vi.fn(),
  deleteProject: vi.fn(),
  downloadVersion: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("../api/video-api", () => ({ videoApi: mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./RenderStatusPanel", () => ({ RenderStatusPanel: () => null }));
vi.mock("./VideoBriefPanel", () => ({ VideoBriefPanel: () => null }));
vi.mock("./VideoStoryboardPanel", () => ({ VideoStoryboardPanel: () => null }));
vi.mock("@visuala/ui", () => ({ Badge: ({ children }: { children: string }) => <span>{children}</span> }));

import { VideoWorkspace } from "./VideoWorkspace";

const workspace = {
  project: { id: "project-1", title: "Es Kopi", videoType: "product_promo", styleId: "bold_pop", status: "draft", settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false }, revisionRenderCount: 0 },
  assets: [{ id: "asset-1", previewUrl: null, mimeType: "image/png", width: 10, height: 10, moderationStatus: "allowed" }],
  messages: [],
  brief: null,
  storyboard: null,
  renderJobs: [],
  versions: [{ id: "version-1", versionNumber: 1, durationSeconds: 10, resolution: "1080p", aspectRatio: "9:16", playbackUrl: "https://example.test/video.mp4" }],
};
const approvableWorkspace = { ...workspace, brief: { isComplete: true }, storyboard: {} };

beforeEach(() => {
  mocks.openInterview.mockResolvedValue({ messages: [{ id: "opening", role: "assistant", content: "Apa produknya?", controls: null, assetIds: [], createdAt: "now" }] });
});

afterEach(() => {
  vi.clearAllMocks();
  router.push.mockReset();
});
Element.prototype.scrollIntoView = vi.fn();

describe("VideoWorkspace", () => {
  it("shows a dark loading shell and renders all concurrently loaded workspace data", async () => {
    mocks.loadVideoWorkspace.mockResolvedValue(approvableWorkspace);
    render(<VideoWorkspace projectId="project-1" />);

    expect(screen.getByRole("status").textContent).toContain("Memuat proyek video...");
    expect(await screen.findByRole("heading", { name: "Es Kopi" })).toBeTruthy();
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(1);
  });

  it("shows the stored AI question on a fresh project before accepting an answer", async () => {
    const opening = { id: "opening", role: "assistant", content: "Siapa target pembelinya?", controls: null, assetIds: [], createdAt: "now" };
    mocks.loadVideoWorkspace.mockResolvedValue(workspace);
    mocks.openInterview.mockResolvedValue({ messages: [opening] });
    render(<VideoWorkspace projectId="project-1" />);
    expect(await screen.findByText("Siapa target pembelinya?")).toBeTruthy();
    expect(mocks.openInterview).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Kirim pesan pertama. AI akan menanyakan satu hal pada satu waktu.")).toBeNull();
  });

  it("renders the workspace while the first AI question is still pending", async () => {
    mocks.loadVideoWorkspace.mockResolvedValue(workspace);
    mocks.openInterview.mockReturnValue(new Promise(() => {}));
    render(<VideoWorkspace projectId="project-1" />);

    expect(await screen.findByRole("heading", { name: "Es Kopi" })).toBeTruthy();
    expect(screen.getByText("AI sedang menyiapkan pertanyaan pertama…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets the user retry a failed opening without starting the chat themselves", async () => {
    mocks.loadVideoWorkspace.mockResolvedValue(workspace);
    mocks.openInterview.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ messages: [{ id: "opening", role: "assistant", content: "Apa produknya?", controls: null, assetIds: [], createdAt: "now" }] });
    render(<VideoWorkspace projectId="project-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Coba mulai percakapan lagi" }));
    expect(await screen.findByText("Apa produknya?")).toBeTruthy();
  });

  it("renders a not-found state for a 404 and a login action for a 401", async () => {
    const { BrowserApiError } = await import("@/lib/api/browser-client");
    mocks.loadVideoWorkspace.mockRejectedValueOnce(new BrowserApiError(404, { error: "Not found" })).mockRejectedValueOnce(new BrowserApiError(401, { error: "Unauthorized" }));
    const { rerender } = render(<VideoWorkspace projectId="missing" />);

    expect(await screen.findByText("Proyek tidak ditemukan.")).toBeTruthy();
    rerender(<VideoWorkspace projectId="unauthorized" />);
    expect(await screen.findByRole("link", { name: "Masuk" })).toBeTruthy();
  });

  it("offers a retry after a recoverable load failure", async () => {
    mocks.loadVideoWorkspace.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(workspace);
    render(<VideoWorkspace projectId="project-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByRole("heading", { name: "Es Kopi" })).toBeTruthy();
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2);
  });

  it("retries a failed load, aborts replaced and unmounted loads, and ignores stale results", async () => {
    let firstResolve!: (value: typeof workspace) => void;
    const first = new Promise<typeof workspace>((resolve) => { firstResolve = resolve; });
    mocks.loadVideoWorkspace.mockReturnValueOnce(first).mockResolvedValueOnce({ ...workspace, project: { ...workspace.project, id: "project-2", title: "Teh" } });
    const { rerender, unmount } = render(<VideoWorkspace projectId="project-1" />);
    await vi.waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.loadVideoWorkspace.mock.calls[0]?.[1] as AbortSignal;

    rerender(<VideoWorkspace projectId="project-2" />);
    expect(firstSignal.aborted).toBe(true);
    expect(await screen.findByRole("heading", { name: "Teh" })).toBeTruthy();
    await act(async () => firstResolve(workspace));
    expect(screen.queryByRole("heading", { name: "Es Kopi" })).toBeNull();

    unmount();
    const lastSignal = mocks.loadVideoWorkspace.mock.calls.at(-1)?.[1] as AbortSignal;
    expect(lastSignal.aborted).toBe(true);
  });

  it("reloads after chat and approval, updates assets after deletion, and downloads through the API callback", async () => {
    mocks.loadVideoWorkspace.mockResolvedValue(approvableWorkspace);
    mocks.sendMessage.mockResolvedValue({ message: { id: "answer", role: "user", content: "Halo", controls: null, assetIds: [], createdAt: "now" }, reply: { id: "next", role: "assistant", content: "Siapa pembelinya?", controls: null, assetIds: [], createdAt: "now" }, project: workspace.project });
    mocks.approveProject.mockResolvedValue({});
    mocks.deleteAsset.mockResolvedValue({ deleted: true });
    mocks.downloadVersion.mockResolvedValue(undefined);
    render(<VideoWorkspace projectId="project-1" />);

    const input = await screen.findByLabelText("Pesan Anda");
    fireEvent.change(input, { target: { value: "Halo" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kirim" })));
    await vi.waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Setujui brief dan storyboard" })));
    await vi.waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(3));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hapus aset" })));
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Hapus aset" })).toBeNull());

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unduh" })));
    await vi.waitFor(() => expect(mocks.downloadVersion).toHaveBeenCalledWith("project-1", "version-1"));
  });

  it("deletes the project through the API and navigates back to the video library", async () => {
    mocks.loadVideoWorkspace.mockResolvedValue(workspace);
    mocks.deleteProject.mockResolvedValue({ deleted: true });
    render(<VideoWorkspace projectId="project-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Hapus proyek" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));

    await vi.waitFor(() => expect(mocks.deleteProject).toHaveBeenCalledWith("project-1"));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/videos"));
  });

  it("keeps the workspace and shows a recoverable error when deletion fails", async () => {
    mocks.loadVideoWorkspace.mockResolvedValue(workspace);
    mocks.deleteProject.mockRejectedValue(new Error("offline"));
    render(<VideoWorkspace projectId="project-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Hapus proyek" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Proyek tidak dapat dihapus. Coba lagi.");
    expect(router.push).not.toHaveBeenCalled();
  });
});
