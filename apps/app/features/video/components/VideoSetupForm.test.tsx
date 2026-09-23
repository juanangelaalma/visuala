// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createProject: vi.fn(), push: vi.fn(), randomUUID: vi.fn(), uploadAsset: vi.fn() }));
const videoClient = { createProject: mocks.createProject, uploadAsset: mocks.uploadAsset };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("@visuala/ui", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
}));

import { VideoSetupForm } from "./VideoSetupForm";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function addFiles(...files: File[]) {
  fireEvent.change(screen.getByLabelText(/Pilih foto produk/), { target: { files } });
}

function submitProject() {
  fireEvent.change(screen.getByLabelText("Judul video"), { target: { value: "Kopi susu" } });
  fireEvent.click(screen.getByLabelText("Saya memiliki hak untuk menggunakan semua aset yang diunggah."));
  fireEvent.submit(screen.getByRole("button", { name: "Lanjut ke percakapan" }).closest("form")!);
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: mocks.randomUUID });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("VideoSetupForm", () => {
  it("requires rights confirmation before submitting a project", async () => {
    render(<VideoSetupForm api={videoClient} />);
    fireEvent.submit(screen.getByRole("button", { name: "Lanjut ke percakapan" }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toContain("Konfirmasikan hak penggunaan aset untuk melanjutkan.");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("reuses the idempotency key after an ambiguous project-create failure", async () => {
    mocks.createProject.mockRejectedValueOnce(new Error("Network request failed")).mockResolvedValueOnce({ project: { id: "project-1" } });
    mocks.randomUUID.mockReturnValue("retry-key");
    render(<VideoSetupForm api={videoClient} />);

    submitProject();

    await screen.findByRole("alert");
    fireEvent.submit(screen.getByRole("button", { name: "Lanjut ke percakapan" }).closest("form")!);

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/videos/project-1"));
    expect(mocks.createProject.mock.calls[0]?.[1]).toBe(mocks.createProject.mock.calls[1]?.[1]);
  });

  it("creates a new idempotency key for each completed deliberate submission", async () => {
    mocks.createProject.mockResolvedValue({ project: { id: "project-1" } });
    mocks.randomUUID.mockReturnValueOnce("first-key").mockReturnValueOnce("second-key");
    render(<VideoSetupForm api={videoClient} />);

    submitProject();
    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(1));
    fireEvent.submit(screen.getByRole("button", { name: "Lanjut ke percakapan" }).closest("form")!);

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(2));
    expect(mocks.createProject.mock.calls.map((call) => call[1])).toEqual(["first-key", "second-key"]);
  });

  it("uploads files sequentially and navigates only after every upload completes", async () => {
    const firstUpload = deferred<unknown>();
    const secondUpload = deferred<unknown>();
    mocks.createProject.mockResolvedValue({ project: { id: "project-1" } });
    mocks.randomUUID.mockReturnValueOnce("first-file").mockReturnValueOnce("second-file").mockReturnValueOnce("project-key");
    mocks.uploadAsset.mockReturnValueOnce(firstUpload.promise).mockReturnValueOnce(secondUpload.promise);
    render(<VideoSetupForm api={videoClient} />);

    addFiles(new File(["first"], "first.png", { type: "image/png" }), new File(["second"], "second.png", { type: "image/png" }));
    submitProject();

    await waitFor(() => expect(mocks.uploadAsset).toHaveBeenCalledTimes(1));
    expect(mocks.uploadAsset.mock.calls[0]?.[1].name).toBe("first.png");
    expect(mocks.push).not.toHaveBeenCalled();
    firstUpload.resolve({});
    await waitFor(() => expect(mocks.uploadAsset).toHaveBeenCalledTimes(2));
    expect(mocks.uploadAsset.mock.calls[1]?.[1].name).toBe("second.png");
    expect(mocks.push).not.toHaveBeenCalled();
    secondUpload.resolve({});
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/videos/project-1"));
  });

  it("does not start the next upload when the active upload resolves after unmount", async () => {
    const firstUpload = deferred<unknown>();
    mocks.createProject.mockResolvedValue({ project: { id: "project-1" } });
    mocks.randomUUID.mockReturnValueOnce("first-file").mockReturnValueOnce("second-file").mockReturnValueOnce("project-key");
    mocks.uploadAsset.mockReturnValueOnce(firstUpload.promise);
    const { unmount } = render(<VideoSetupForm api={videoClient} />);

    addFiles(new File(["first"], "first.png", { type: "image/png" }), new File(["second"], "second.png", { type: "image/png" }));
    submitProject();
    await waitFor(() => expect(mocks.uploadAsset).toHaveBeenCalledTimes(1));
    const signal = mocks.uploadAsset.mock.calls[0]?.[3] as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
    firstUpload.resolve({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.uploadAsset).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows a failed filename and created workspace link after a partial upload failure", async () => {
    mocks.createProject.mockResolvedValue({ project: { id: "project-1" } });
    mocks.randomUUID.mockReturnValueOnce("failed-file").mockReturnValueOnce("project-key");
    mocks.uploadAsset.mockRejectedValue(new Error("Upload failed"));
    render(<VideoSetupForm api={videoClient} />);

    addFiles(new File(["failed"], "failed.png", { type: "image/png" }));
    submitProject();

    expect(await screen.findByText(/failed\.png: Tidak dapat mengunggah gambar\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Buka ruang kerja proyek" }).getAttribute("href")).toBe("/dashboard/videos/project-1");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("aborts an in-flight create request when unmounted", async () => {
    const create = deferred<never>();
    mocks.createProject.mockReturnValue(create.promise);
    mocks.randomUUID.mockReturnValue("project-key");
    const { unmount } = render(<VideoSetupForm api={videoClient} />);

    submitProject();
    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(1));
    const signal = mocks.createProject.mock.calls[0]?.[2] as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
  });
});
