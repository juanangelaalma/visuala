// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoBriefRevision, VideoMessage } from "@/domain/video/types";
import { BrowserApiError } from "@/lib/api/browser-client";
import type { VideoChatStreamOptions, VideoOpeningResult, VideoSendResult, VideoWorkspaceData } from "../api/video-api";

const mocks = vi.hoisted(() => ({
  loadVideoWorkspace: vi.fn(), sendMessage: vi.fn(), openInterview: vi.fn(),
  createComposition: vi.fn(), startRender: vi.fn(), deleteAsset: vi.fn(),
  deleteProject: vi.fn(), downloadVersion: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("../api/video-api", () => ({ videoApi: mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./RenderStatusPanel", () => ({ RenderStatusPanel: ({ onSettled }: { onSettled: () => void }) => (
  <button type="button" onClick={onSettled}>Selesaikan render</button>
) }));
vi.mock("./VideoCompositionPanel", () => ({ VideoCompositionPanel: () => null }));
vi.mock("@visuala/ui", () => ({ Badge: ({ children }: { children: string }) => <span>{children}</span> }));

import { VideoWorkspace } from "./VideoWorkspace";

const question: VideoMessage = {
  id: "opening", role: "assistant", content: "Siapa target pembelinya?", assetIds: [], createdAt: "now",
  controls: {
    question: "Siapa target pembelinya?", control: "single_select",
    options: [{ id: "students", label: "Mahasiswa", detail: null }],
    recommendedOptionId: null, recommendationReason: null, targetFields: ["audience"], briefComplete: false,
  },
};
const workspace: VideoWorkspaceData = {
  project: {
    id: "project-1", title: "Es Kopi", videoType: "product_promo", styleId: "creative-mode", status: "interviewing",
    settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
    revisionRenderCount: 0, createdAt: "now", updatedAt: "now",
  },
  assets: [], messages: [question], brief: null, composition: null, renderJob: null, versions: [],
};
const emptyWorkspace: VideoWorkspaceData = { ...workspace, messages: [] };
const answer: VideoMessage = { id: "answer", role: "user", content: "Pemilik kedai", controls: null, assetIds: [], createdAt: "now" };
const finalReply: VideoMessage = { id: "final", role: "assistant", content: "Brief sudah lengkap. Minta preview kalau sudah siap.", controls: null, assetIds: [], createdAt: "now" };
const sendResult: VideoSendResult = { message: answer, reply: finalReply, project: { ...workspace.project, status: "awaiting_approval" } };
const brief: VideoBriefRevision = {
  id: "brief-1", version: 1, schemaVersion: "video-brief@v1", isComplete: true, createdAt: "now",
  brief: {
    productName: "Es Kopi", productCategory: null, audience: "Pemilik kedai", objective: null,
    keyMessage: null, offer: null, callToAction: null, orderDestination: null, brandName: null,
    styleId: "creative-mode", outputSettings: workspace.project.settings, menuItems: null, facts: [],
  },
};
const completedWorkspace: VideoWorkspaceData = {
  ...workspace, project: sendResult.project, messages: [question, answer, finalReply], brief,
};
const disconnectedMessage = "Koneksi terputus. Muat ulang percakapan sebelum mengirim lagi.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function submitAnswer() {
  fireEvent.change(screen.getByLabelText("Pesan Anda"), { target: { value: answer.content } });
  fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.loadVideoWorkspace.mockResolvedValue(workspace);
  mocks.openInterview.mockResolvedValue({ messages: [question] });
});
afterEach(cleanup);

describe("VideoWorkspace", () => {
  it("keeps loading and load recovery usable before a project has been read", async () => {
    const firstRead = deferred<VideoWorkspaceData>();
    mocks.loadVideoWorkspace.mockReturnValueOnce(firstRead.promise).mockResolvedValueOnce(workspace);
    render(<VideoWorkspace projectId="project-1" />);
    expect(screen.getByRole("status").textContent).toContain("Memuat proyek video");
    await act(async () => { firstRead.reject(new Error("offline")); });
    fireEvent.click(await screen.findByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByRole("heading", { name: "Es Kopi" })).toBeTruthy();
    expect(screen.getByText(question.content)).toBeTruthy();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("streams the automatic opening while preventing answers and adopts the saved race winner instead of its preview", async () => {
    const completion = deferred<VideoOpeningResult>();
    let options!: VideoChatStreamOptions;
    const winner = { ...question, id: "winner", content: "Apa tujuan video ini?", controls: null };
    mocks.loadVideoWorkspace.mockResolvedValueOnce(emptyWorkspace).mockResolvedValue({ ...workspace, messages: [winner] });
    mocks.openInterview.mockImplementation((_id: string, incoming: VideoChatStreamOptions) => {
      options = incoming;
      return completion.promise;
    });
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByRole("heading", { name: "Es Kopi" });
    await waitFor(() => expect(mocks.openInterview).toHaveBeenCalledTimes(1));
    act(() => options.onTextDelta?.("Siapa target"));
    expect(screen.getByLabelText("Jawaban AI sementara").textContent).toBe("Siapa target");
    expect(within(screen.getByRole("log")).queryByText("Siapa target")).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(1);
    await act(async () => { completion.resolve({ messages: [winner, winner] }); });
    expect(screen.queryByLabelText("Jawaban AI sementara")).toBeNull();
    expect(screen.getAllByText(winner.content)).toHaveLength(1);
    expect(screen.queryByText("Siapa target")).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2);
  });

  it("accepts an existing opening without requiring a text delta", async () => {
    mocks.loadVideoWorkspace.mockResolvedValueOnce(emptyWorkspace).mockResolvedValue(workspace);
    render(<VideoWorkspace projectId="project-1" />);
    expect(await screen.findByText(question.content)).toBeTruthy();
    expect(screen.getAllByText(question.content)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mahasiswa" })).toBeTruthy();
    expect(screen.queryByLabelText("Jawaban AI sementara")).toBeNull();
  });

  it("retries an opening only on request and synchronously excludes repeated retry clicks", async () => {
    const retry = deferred<VideoOpeningResult>();
    let options!: VideoChatStreamOptions;
    mocks.loadVideoWorkspace.mockResolvedValue(emptyWorkspace);
    mocks.openInterview.mockRejectedValueOnce(new BrowserApiError(503, { error: "AI belum tersedia." }))
      .mockImplementationOnce((_id: string, incoming: VideoChatStreamOptions) => {
        options = incoming;
        return retry.promise;
      });
    render(<VideoWorkspace projectId="project-1" />);
    const retryButton = await screen.findByRole("button", { name: "Coba mulai percakapan lagi" });
    await waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((retryButton as HTMLButtonElement).disabled).toBe(false));
    act(() => { fireEvent.click(retryButton); fireEvent.click(retryButton); });
    expect(mocks.openInterview).toHaveBeenCalledTimes(2);
    act(() => options.onTextDelta?.("Siapa target pembelinya?"));
    expect(screen.getByLabelText("Jawaban AI sementara").textContent).toBe(question.content);
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    mocks.loadVideoWorkspace.mockResolvedValue(workspace);
    await act(async () => { retry.resolve({ messages: [question] }); });
    expect(screen.getAllByText(question.content)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mahasiswa" })).toBeTruthy();
  });

  it("moves an acknowledged answer into saved history once and replaces provisional text with the server fallback", async () => {
    const completion = deferred<VideoSendResult>();
    let options!: VideoChatStreamOptions;
    mocks.sendMessage.mockImplementation((_id: string, _content: string, _assets: string[] | undefined, incoming: VideoChatStreamOptions) => {
      options = incoming;
      return completion.promise;
    });
    mocks.loadVideoWorkspace.mockResolvedValueOnce(workspace).mockResolvedValue(completedWorkspace);
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    expect(screen.getAllByText(answer.content)).toHaveLength(1);
    expect(within(screen.getByRole("log")).queryByText(answer.content)).toBeNull();
    act(() => {
      options.onMessagePersisted?.({ message: answer, project: workspace.project });
      options.onMessagePersisted?.({ message: answer, project: workspace.project });
      options.onTextDelta?.("Apa penawaran");
      options.onTextDelta?.(" yang ingin dipromosikan?");
    });
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
    expect(screen.getAllByText(answer.content)).toHaveLength(1);
    expect(screen.getByLabelText("Jawaban AI sementara").textContent).toBe("Apa penawaran yang ingin dipromosikan?");
    expect(screen.queryByRole("button", { name: "Mahasiswa" })).toBeNull();
    expect((screen.getByRole("button", { name: "Mengirim…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(1);
    await act(async () => { completion.resolve(sendResult); });
    expect(screen.queryByLabelText("Jawaban AI sementara")).toBeNull();
    expect(screen.queryByText("Apa penawaran yang ingin dipromosikan?")).toBeNull();
    expect(within(screen.getByRole("log")).getAllByText(finalReply.content)).toHaveLength(1);
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
    expect(await screen.findByText("Lengkap")).toBeTruthy();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2);
  });

  it("cancels a pre-turn background read, coalesces reloads during streaming and never lets its stale result overwrite completion", async () => {
    const staleRead = deferred<VideoWorkspaceData>();
    const terminalRead = deferred<VideoWorkspaceData>();
    const completion = deferred<VideoSendResult>();
    let options!: VideoChatStreamOptions;
    mocks.loadVideoWorkspace.mockResolvedValueOnce(workspace).mockReturnValueOnce(staleRead.promise).mockReturnValueOnce(terminalRead.promise);
    mocks.sendMessage.mockImplementation((_id: string, _content: string, _assets: string[] | undefined, incoming: VideoChatStreamOptions) => {
      options = incoming;
      return completion.promise;
    });
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    fireEvent.click(screen.getByRole("button", { name: "Selesaikan render" }));
    const staleSignal = mocks.loadVideoWorkspace.mock.calls[1][1] as AbortSignal;
    submitAnswer();
    expect(staleSignal.aborted).toBe(true);
    act(() => {
      options.onMessagePersisted?.({ message: answer, project: workspace.project });
      options.onTextDelta?.("Pertanyaan sementara");
      fireEvent.click(screen.getByRole("button", { name: "Selesaikan render" }));
      fireEvent.click(screen.getByRole("button", { name: "Selesaikan render" }));
    });
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2);
    await act(async () => { completion.resolve(sendResult); });
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(3);
    await act(async () => { staleRead.resolve({ ...workspace, project: { ...workspace.project, title: "Judul lama" } }); });
    expect(screen.queryByRole("heading", { name: "Judul lama" })).toBeNull();
    expect(screen.getByText(finalReply.content)).toBeTruthy();
    await act(async () => { terminalRead.resolve(completedWorkspace); });
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
    expect(screen.getAllByText(finalReply.content)).toHaveLength(1);
    expect(screen.getByText("Lengkap")).toBeTruthy();
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(3);
  });

  it("restores a draft for a known pre-stream rejection without inventing saved messages", async () => {
    mocks.sendMessage.mockRejectedValue(new BrowserApiError(422, { error: "Jawaban tidak diterima." }));
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    expect(await screen.findByText("Jawaban tidak diterima.")).toBeTruthy();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe(answer.content);
    expect(within(screen.getByRole("log")).queryByText(answer.content)).toBeNull();
    expect(screen.queryByLabelText("Jawaban AI sementara")).toBeNull();
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps an acknowledged user after a terminal stream error and never restores or automatically resends the draft", async () => {
    const completion = deferred<VideoSendResult>();
    let options!: VideoChatStreamOptions;
    mocks.loadVideoWorkspace.mockResolvedValueOnce(workspace).mockResolvedValue({ ...workspace, messages: [question, answer] });
    mocks.sendMessage.mockImplementation((_id: string, _content: string, _assets: string[] | undefined, incoming: VideoChatStreamOptions) => {
      options = incoming;
      return completion.promise;
    });
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    act(() => {
      options.onMessagePersisted?.({ message: answer, project: workspace.project });
      options.onTextDelta?.("Pertanyaan belum selesai");
    });
    await act(async () => { completion.reject(new BrowserApiError(503, { error: "AI tidak tersedia." }, true)); });
    expect(screen.queryByText("Pertanyaan belum selesai")).toBeNull();
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("alert").textContent).toContain("Jawaban Anda mungkin sudah tersimpan.");
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2);
  });

  it("treats an HTTP-shaped failure after persistence as unsafe to resend even if its streamed flag is false", async () => {
    mocks.loadVideoWorkspace.mockResolvedValueOnce(workspace).mockResolvedValue({ ...workspace, messages: [question, answer] });
    mocks.sendMessage.mockImplementation((_id: string, _content: string, _assets: string[] | undefined, options: VideoChatStreamOptions) => {
      options.onMessagePersisted?.({ message: answer, project: workspace.project });
      return Promise.reject(new BrowserApiError(503, { error: "Tidak tersedia." }));
    });
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe("");
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
  });

  it("reconciles an ambiguous unacknowledged send from persisted reads instead of replaying it", async () => {
    mocks.loadVideoWorkspace.mockResolvedValueOnce(workspace).mockResolvedValue(completedWorkspace);
    mocks.sendMessage.mockRejectedValue(new Error("connection ended before acknowledgement"));
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    expect(await screen.findByText(finalReply.content)).toBeTruthy();
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("alert").textContent).toBe(disconnectedMessage);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2);
  });

  it("blocks unsafe sends across failed reconciliation and failed reload until a persisted reload succeeds", async () => {
    const recovery = deferred<VideoWorkspaceData>();
    mocks.loadVideoWorkspace.mockResolvedValueOnce(workspace)
      .mockRejectedValueOnce(new Error("GET offline"))
      .mockRejectedValueOnce(new Error("GET still offline"))
      .mockReturnValueOnce(recovery.promise);
    mocks.sendMessage.mockRejectedValue(new Error("POST disconnected"));
    render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    const reload = await screen.findByRole("button", { name: "Muat ulang percakapan" });
    expect(screen.getByRole("alert").textContent).toContain(disconnectedMessage);
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    fireEvent.click(reload);
    await waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(3));
    await waitFor(() => expect((screen.getByRole("button", { name: "Muat ulang percakapan" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole("alert").textContent).toContain(disconnectedMessage);
    fireEvent.click(screen.getByRole("button", { name: "Muat ulang percakapan" }));
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => { recovery.resolve(completedWorkspace); });
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
    expect(screen.getAllByText(finalReply.content)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Muat ulang percakapan" })).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(["opening", "retry", "send"] as const)("aborts %s on navigation and ignores late deltas, persistence and completion from the old project", async (kind) => {
    const completion = deferred<VideoSendResult>();
    const opening = deferred<VideoOpeningResult>();
    const nextRead = deferred<VideoWorkspaceData>();
    let options!: VideoChatStreamOptions;
    mocks.loadVideoWorkspace.mockResolvedValue(kind === "send" ? workspace : emptyWorkspace);
    const openingImplementation = (_id: string, incoming: VideoChatStreamOptions) => {
      options = incoming;
      return opening.promise;
    };
    if (kind === "retry") {
      mocks.openInterview.mockRejectedValueOnce(new BrowserApiError(503, { error: "AI belum tersedia." })).mockImplementationOnce(openingImplementation);
    } else if (kind === "opening") {
      mocks.openInterview.mockImplementation(openingImplementation);
    } else {
      mocks.sendMessage.mockImplementation((_id: string, _content: string, _assets: string[] | undefined, incoming: VideoChatStreamOptions) => {
        options = incoming;
        return completion.promise;
      });
    }
    const { rerender } = render(<VideoWorkspace projectId="project-1" />);
    await screen.findByRole("heading", { name: "Es Kopi" });
    if (kind === "send") submitAnswer();
    if (kind === "retry") {
      const button = await screen.findByRole("button", { name: "Coba mulai percakapan lagi" });
      await waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2));
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button);
    }
    await waitFor(() => expect(options?.signal).toBeDefined());
    act(() => options.onTextDelta?.("Provisional proyek lama"));
    mocks.loadVideoWorkspace.mockReturnValueOnce(nextRead.promise);
    rerender(<VideoWorkspace projectId="project-2" />);
    expect(options.signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Es Kopi" })).toBeNull());
    expect(screen.getByRole("status")).toBeTruthy();
    await act(async () => { nextRead.resolve({ ...workspace, project: { ...workspace.project, id: "project-2", title: "Teh" } }); });
    act(() => {
      options.onTextDelta?.("Teks terlambat");
      options.onMessagePersisted?.({ message: answer, project: workspace.project });
    });
    await act(async () => {
      completion.resolve(sendResult);
      opening.resolve({ messages: [finalReply] });
    });
    expect(screen.getByRole("heading", { name: "Teh" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Es Kopi" })).toBeNull();
    expect(screen.queryByText("Teks terlambat")).toBeNull();
    expect(screen.queryByText(answer.content)).toBeNull();
    expect(screen.queryByText(finalReply.content)).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("invalidates failed-request reconciliation on navigation without carrying its recovery lock into the new project", async () => {
    const reconciliation = deferred<VideoWorkspaceData>();
    mocks.loadVideoWorkspace.mockResolvedValueOnce(workspace).mockReturnValueOnce(reconciliation.promise)
      .mockResolvedValueOnce({ ...workspace, project: { ...workspace.project, id: "project-2", title: "Teh" } });
    mocks.sendMessage.mockRejectedValue(new Error("POST disconnected"));
    const { rerender } = render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    await waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(2));
    const signal = mocks.loadVideoWorkspace.mock.calls[1][1] as AbortSignal;
    rerender(<VideoWorkspace projectId="project-2" />);
    expect(signal.aborted).toBe(true);
    await screen.findByRole("heading", { name: "Teh" });
    await act(async () => { reconciliation.reject(new Error("late GET failure")); });
    expect(screen.queryByRole("button", { name: "Muat ulang percakapan" })).toBeNull();
    expect(screen.queryByText(disconnectedMessage)).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("aborts an active send on unmount without a terminal refresh or an automatic resend", async () => {
    const completion = deferred<VideoSendResult>();
    let options!: VideoChatStreamOptions;
    mocks.sendMessage.mockImplementation((_id: string, _content: string, _assets: string[] | undefined, incoming: VideoChatStreamOptions) => {
      options = incoming;
      return completion.promise;
    });
    const { unmount } = render(<VideoWorkspace projectId="project-1" />);
    await screen.findByLabelText("Pesan Anda");
    submitAnswer();
    unmount();
    expect(options.signal?.aborted).toBe(true);
    await act(async () => { completion.reject(new Error("aborted")); });
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(1);
  });

  it("rejects late initial workspace reads and aborts pending reads on unmount", async () => {
    const oldRead = deferred<VideoWorkspaceData>();
    const pendingRead = deferred<VideoWorkspaceData>();
    mocks.loadVideoWorkspace.mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce({ ...workspace, project: { ...workspace.project, id: "project-2", title: "Teh" } })
      .mockReturnValueOnce(pendingRead.promise);
    const { rerender, unmount } = render(<VideoWorkspace projectId="project-1" />);
    await waitFor(() => expect(mocks.loadVideoWorkspace).toHaveBeenCalledTimes(1));
    const oldSignal = mocks.loadVideoWorkspace.mock.calls[0][1] as AbortSignal;
    rerender(<VideoWorkspace projectId="project-2" />);
    expect(oldSignal.aborted).toBe(true);
    await screen.findByRole("heading", { name: "Teh" });
    await act(async () => { oldRead.resolve(workspace); });
    expect(screen.queryByRole("heading", { name: "Es Kopi" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Selesaikan render" }));
    const pendingSignal = mocks.loadVideoWorkspace.mock.calls[2][1] as AbortSignal;
    unmount();
    expect(pendingSignal.aborted).toBe(true);
    await act(async () => { pendingRead.resolve(workspace); });
  });

  it("shows not-found and expired-session actions when reads are rejected", async () => {
    mocks.loadVideoWorkspace.mockRejectedValueOnce(new BrowserApiError(404, { error: "Not found" }))
      .mockRejectedValueOnce(new BrowserApiError(401, { error: "Unauthorized" }));
    const { rerender } = render(<VideoWorkspace projectId="missing" />);
    expect(await screen.findByText("Proyek tidak ditemukan.")).toBeTruthy();
    rerender(<VideoWorkspace projectId="unauthorized" />);
    expect(await screen.findByRole("link", { name: "Masuk" })).toBeTruthy();
  });

  it("deletes a confirmed project and navigates back to the library", async () => {
    mocks.deleteProject.mockResolvedValue({ deleted: true });
    render(<VideoWorkspace projectId="project-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus proyek" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/videos"));
  });

  it("keeps the project available after deletion fails", async () => {
    mocks.deleteProject.mockRejectedValue(new Error("offline"));
    render(<VideoWorkspace projectId="project-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus proyek" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Proyek tidak dapat dihapus");
    expect(screen.getByRole("heading", { name: "Es Kopi" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Ya, hapus" }) as HTMLButtonElement).disabled).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });
});
