// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listProjects: vi.fn() }));

vi.mock("../api/video-api", () => ({
  videoApi: { listProjects: mocks.listProjects },
}));

vi.mock("@visuala/ui", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { VideoProjectLibraryContainer } from "./VideoProjectLibraryContainer";

const project = {
  id: "project-1",
  title: "Es Kopi Gula Aren",
  videoType: "product_promo" as const,
  styleId: "bold_pop" as const,
  status: "draft" as const,
  settings: { durationSeconds: 10 as const, aspectRatio: "9:16" as const, resolution: "1080p" as const, language: "id", voiceOverEnabled: true, musicEnabled: true },
  revisionRenderCount: 0,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

afterEach(() => vi.clearAllMocks());

describe("VideoProjectLibraryContainer", () => {
  it("shows a loading panel while the project list is pending", () => {
    mocks.listProjects.mockReturnValue(new Promise(() => undefined));

    render(<VideoProjectLibraryContainer />);

    expect(screen.getByRole("status").textContent).toContain("Memuat proyek video...");
  });

  it("passes the unchanged project data to the existing library", async () => {
    mocks.listProjects.mockResolvedValue({ projects: [project] });

    render(<VideoProjectLibraryContainer />);

    expect(await screen.findByRole("heading", { name: project.title })).toBeTruthy();
  });

  it("renders the existing empty library when the request returns no projects", async () => {
    mocks.listProjects.mockResolvedValue({ projects: [] });

    render(<VideoProjectLibraryContainer />);

    expect(await screen.findByRole("heading", { name: "Belum ada proyek video" })).toBeTruthy();
  });

  it("offers a login action when the session is unauthorized", async () => {
    const { BrowserApiError } = await import("@/lib/api/browser-client");
    mocks.listProjects.mockRejectedValue(new BrowserApiError(401, { error: "Unauthorized." }));

    render(<VideoProjectLibraryContainer />);

    expect(await screen.findByRole("link", { name: "Masuk" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Masuk" }).getAttribute("href")).toBe("/login");
  });

  it("offers a retry after a generic failure", async () => {
    mocks.listProjects.mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce({ projects: [project] });

    render(<VideoProjectLibraryContainer />);

    fireEvent.click(await screen.findByRole("button", { name: "Coba lagi" }));

    expect(await screen.findByRole("heading", { name: project.title })).toBeTruthy();
    expect(mocks.listProjects).toHaveBeenCalledTimes(2);
  });

  it("aborts the active project request when it unmounts", () => {
    mocks.listProjects.mockReturnValue(new Promise(() => undefined));

    const { unmount } = render(<VideoProjectLibraryContainer />);
    const signal = mocks.listProjects.mock.calls[0]?.[0] as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
  });
});
