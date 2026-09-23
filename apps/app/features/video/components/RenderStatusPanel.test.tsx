// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoRenderJob, VideoVersion } from "@/domain/video/types";

const mocks = vi.hoisted(() => ({
  getRenderStatus: vi.fn(),
  startRender: vi.fn(),
  cancelRender: vi.fn(),
}));

vi.mock("../api/video-api", () => ({ videoApi: mocks }));

import { BrowserApiError } from "@/lib/api/browser-client";
import { RenderStatusPanel } from "./RenderStatusPanel";

const queuedJob: VideoRenderJob = { id: "job-1", status: "queued", isRevision: false, attempts: 0, queuedAt: "2026-09-22T00:00:00.000Z", createdAt: "2026-09-22T00:00:00.000Z" };
const succeededJob: VideoRenderJob = { ...queuedJob, status: "succeeded" };
const cancelledJob: VideoRenderJob = { ...queuedJob, status: "cancelled" };
const version: VideoVersion = { id: "version-1", versionNumber: 1, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", createdAt: "2026-09-22T00:00:00.000Z", playbackUrl: null };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function renderPanel(overrides: { projectId?: string; initialJob?: VideoRenderJob | null; canRender?: boolean; quotaExhausted?: boolean; onVersionsChange?: (versions: VideoVersion[]) => void } = {}) {
  return render(
    <RenderStatusPanel
      projectId={overrides.projectId ?? "project-1"}
      initialJob={overrides.initialJob === undefined ? queuedJob : overrides.initialJob}
      canRender={overrides.canRender ?? true}
      quotaExhausted={overrides.quotaExhausted ?? false}
      onVersionsChange={overrides.onVersionsChange}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("RenderStatusPanel polling", () => {
  it("shows the initial job immediately and polls the status every three seconds", async () => {
    vi.useFakeTimers();
    mocks.getRenderStatus.mockResolvedValue({ jobs: [queuedJob], versions: [] });
    renderPanel();

    expect(screen.getByText("Dalam antrean")).toBeTruthy();
    expect(mocks.getRenderStatus).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.getRenderStatus).toHaveBeenCalledWith("project-1", expect.any(AbortSignal));
    expect(mocks.getRenderStatus).toHaveBeenCalledTimes(1);
  });

  it("applies a terminal job and its versions together and then stops polling", async () => {
    vi.useFakeTimers();
    const onVersionsChange = vi.fn();
    mocks.getRenderStatus.mockResolvedValue({ jobs: [succeededJob], versions: [version] });
    renderPanel({ onVersionsChange });

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText("Selesai")).toBeTruthy();
    expect(onVersionsChange).toHaveBeenCalledWith([version]);

    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(mocks.getRenderStatus).toHaveBeenCalledTimes(1);
  });

  it("never overlaps requests while a poll is still in flight", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: { jobs: VideoRenderJob[]; versions: VideoVersion[] }) => void;
    mocks.getRenderStatus.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    renderPanel();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.getRenderStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ jobs: [queuedJob], versions: [] });
      await Promise.resolve();
    });
  });

  it("applies neither result on a partial failure and retries after three seconds", async () => {
    vi.useFakeTimers();
    const onVersionsChange = vi.fn();
    mocks.getRenderStatus.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ jobs: [queuedJob], versions: [version] });
    renderPanel({ onVersionsChange });

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole("alert").textContent).toContain("Tidak dapat memuat status render.");
    expect(onVersionsChange).not.toHaveBeenCalled();
    expect(screen.getByText("Dalam antrean")).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(onVersionsChange).toHaveBeenCalledWith([version]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops polling after a 401, 403, or 404 status error", async () => {
    vi.useFakeTimers();
    mocks.getRenderStatus.mockRejectedValue(new BrowserApiError(404, { error: "Not found" }));
    renderPanel();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(mocks.getRenderStatus).toHaveBeenCalledTimes(1);
  });

  it("aborts the in-flight poll on unmount and ignores its stale result", async () => {
    vi.useFakeTimers();
    const onVersionsChange = vi.fn();
    let resolveFirst!: (value: { jobs: VideoRenderJob[]; versions: VideoVersion[] }) => void;
    mocks.getRenderStatus.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    const { unmount } = renderPanel({ onVersionsChange });

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const signal = mocks.getRenderStatus.mock.calls[0]?.[1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);

    await act(async () => {
      resolveFirst({ jobs: [succeededJob], versions: [version] });
      await Promise.resolve();
    });
    expect(onVersionsChange).not.toHaveBeenCalled();
  });

  it("aborts the old project's poll and stops applying its result when the project changes", async () => {
    vi.useFakeTimers();
    mocks.getRenderStatus.mockResolvedValue({ jobs: [queuedJob], versions: [] });
    const { rerender } = renderPanel();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const firstSignal = mocks.getRenderStatus.mock.calls[0]?.[1] as AbortSignal;

    rerender(<RenderStatusPanel projectId="project-2" initialJob={queuedJob} canRender quotaExhausted={false} />);
    expect(firstSignal.aborted).toBe(true);
  });
});

describe("RenderStatusPanel mutations", () => {
  it("dispatches one deliberate start with a fresh UUID, and does not repeat on rerender", async () => {
    mocks.getRenderStatus.mockResolvedValue({ jobs: [], versions: [] });
    mocks.startRender.mockResolvedValueOnce({ job: succeededJob }).mockResolvedValueOnce({ job: queuedJob });
    const { rerender } = renderPanel({ initialJob: null });

    fireEvent.click(screen.getByRole("button", { name: "Render video" }));
    await vi.waitFor(() => expect(mocks.startRender).toHaveBeenCalledTimes(1));
    const firstKey = mocks.startRender.mock.calls[0]?.[1];
    expect(firstKey).toMatch(uuidPattern);

    rerender(<RenderStatusPanel projectId="project-1" initialJob={null} canRender quotaExhausted={false} />);
    expect(mocks.startRender).toHaveBeenCalledTimes(1);

    fireEvent.click(await screen.findByRole("button", { name: "Render ulang" }));
    await vi.waitFor(() => expect(mocks.startRender).toHaveBeenCalledTimes(2));
    expect(mocks.startRender.mock.calls[1]?.[1]).toMatch(uuidPattern);
    expect(mocks.startRender.mock.calls[1]?.[1]).not.toBe(firstKey);
  });

  it("updates the job from a cancellation response", async () => {
    mocks.getRenderStatus.mockResolvedValue({ jobs: [queuedJob], versions: [] });
    mocks.cancelRender.mockResolvedValue({ job: cancelledJob });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Batalkan render" }));
    await vi.waitFor(() => expect(mocks.cancelRender).toHaveBeenCalledWith("project-1", "job-1"));
    expect(await screen.findByText("Dibatalkan")).toBeTruthy();
  });

  it("shows recoverable copy when a start fails", async () => {
    mocks.getRenderStatus.mockResolvedValue({ jobs: [], versions: [] });
    mocks.startRender.mockRejectedValue(new Error("offline"));
    renderPanel({ initialJob: null });

    fireEvent.click(screen.getByRole("button", { name: "Render video" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Tidak dapat memulai render. Coba lagi.");
  });

  it("shows recoverable copy when a cancellation fails", async () => {
    mocks.getRenderStatus.mockResolvedValue({ jobs: [queuedJob], versions: [] });
    mocks.cancelRender.mockRejectedValue(new Error("offline"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Batalkan render" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Tidak dapat membatalkan render. Coba lagi.");
  });
});
