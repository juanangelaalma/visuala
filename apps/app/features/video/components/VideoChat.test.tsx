// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMessage } from "@/domain/video/types";
import { VideoChat, type VideoChatSendOutcome } from "./VideoChat";

type ChatProps = ComponentProps<typeof VideoChat>;

const question: VideoMessage = {
  id: "question", role: "assistant", content: "Siapa targetnya?", assetIds: [], createdAt: "now",
  controls: {
    question: "Siapa targetnya?", control: "multi_select",
    options: [{ id: "a", label: "Mahasiswa", detail: "Belajar di kampus" }, { id: "b", label: "Pekerja", detail: null }],
    recommendedOptionId: "a", recommendationReason: "Sesuai produk", targetFields: ["audience"], briefComplete: false,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function chatProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    messages: [question], streaming: null, onSend: vi.fn().mockResolvedValue({ ok: true }),
    onReloadConversation: vi.fn(), ...overrides,
  };
}

function OutgoingWorkspace({ onSend }: { onSend: ChatProps["onSend"] }) {
  const [streaming, setStreaming] = useState<ChatProps["streaming"]>(null);
  return <VideoChat {...chatProps()} streaming={streaming} onSend={async (content, assetIds) => {
    setStreaming({ kind: "send", outgoing: content, text: "" });
    const result = await onSend(content, assetIds);
    setStreaming(null);
    return result;
  }} />;
}

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

describe("VideoChat", () => {
  it("submits a multi-select label immediately, closes choices and renders workspace outgoing outside saved history", () => {
    const onSend = vi.fn(() => new Promise<VideoChatSendOutcome>(() => {}));
    render(<OutgoingWorkspace onSend={onSend} />);
    expect(screen.getByText("Belajar di kampus")).toBeTruthy();
    expect(screen.getByText("Alasan: Sesuai produk")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mahasiswa/ }));
    expect(screen.getByText("Mahasiswa")).toBeTruthy();
    expect(within(screen.getByRole("log")).queryByText("Mahasiswa")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pekerja" })).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    expect(onSend).toHaveBeenCalledWith("Mahasiswa", undefined);
  });

  it("clears typed text immediately and displays only the workspace-owned outgoing answer", () => {
    const onSend = vi.fn(() => new Promise<VideoChatSendOutcome>(() => {}));
    render(<OutgoingWorkspace onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("Pesan Anda"), { target: { value: "Pemilik kedai" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getAllByText("Pemilik kedai")).toHaveLength(1);
    expect(within(screen.getByRole("log")).queryByText("Pemilik kedai")).toBeNull();
    expect(onSend).toHaveBeenCalledWith("Pemilik kedai", undefined);
  });

  it("locks different option submissions synchronously before React commits pending state", async () => {
    const completion = deferred<VideoChatSendOutcome>();
    const onSend = vi.fn(() => completion.promise);
    render(<VideoChat {...chatProps({ onSend })} />);
    const first = screen.getByRole("button", { name: /Mahasiswa/ });
    const second = screen.getByRole("button", { name: "Pekerja" });
    act(() => {
      fireEvent.click(first);
      fireEvent.click(second);
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Mahasiswa", undefined);
    await act(async () => { completion.resolve({ ok: false, error: "Jawaban ditolak.", restoreDraft: true }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pekerja" })); });
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])("restores a submitted draft only when the outcome explicitly allows it (%s)", async (restoreDraft) => {
    const onSend = vi.fn().mockResolvedValue({ ok: false, error: "Jawaban belum diterima.", restoreDraft });
    render(<VideoChat {...chatProps({ onSend })} />);
    fireEvent.change(screen.getByLabelText("Pesan Anda"), { target: { value: "Pemilik kedai" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe(restoreDraft ? "Pemilik kedai" : "");
    expect(screen.getByRole("button", { name: "Pekerja" })).toBeTruthy();
    expect(within(screen.getByRole("log")).queryByText("Pemilik kedai")).toBeNull();
  });

  it("does not restore a draft when a callback unexpectedly rejects", async () => {
    render(<VideoChat {...chatProps({ onSend: vi.fn().mockRejectedValue(new Error("offline")) })} />);
    fireEvent.change(screen.getByLabelText("Pesan Anda"), { target: { value: "Pemilik kedai" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps one growing provisional assistant outside the live log until authoritative completion replaces it", () => {
    const props = chatProps({ streaming: { kind: "send", text: "Apa pesan", outgoing: "" } });
    const { rerender } = render(<VideoChat {...props} />);
    const status = screen.getByRole("status");
    const announcement = status.textContent;
    const provisional = screen.getByLabelText("Jawaban AI sementara");
    expect(provisional.getAttribute("aria-busy")).toBe("true");
    expect(provisional.getAttribute("aria-live")).toBe("off");
    expect(within(screen.getByRole("log")).queryByText("Apa pesan")).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Pekerja" })).toBeNull();

    const scrollsBeforeGrowth = vi.mocked(Element.prototype.scrollIntoView).mock.calls.length;
    rerender(<VideoChat {...props} streaming={{ kind: "send", text: "Apa pesan utamanya?", outgoing: "" }} />);
    expect(screen.getAllByLabelText("Jawaban AI sementara")).toHaveLength(1);
    expect(provisional.textContent).toBe("Apa pesan utamanya?");
    expect(status.textContent).toBe(announcement);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.calls.length).toBeGreaterThan(scrollsBeforeGrowth);

    const answer: VideoMessage = { id: "answer", role: "user", content: "Mahasiswa", controls: null, assetIds: [], createdAt: "now" };
    const final: VideoMessage = { ...question, id: "final", content: "Apa keunggulan produknya?", controls: { ...question.controls!, question: "Apa keunggulan produknya?", options: [{ id: "quality", label: "Kualitas", detail: null }], recommendedOptionId: null, recommendationReason: null } };
    rerender(<VideoChat {...props} streaming={null} messages={[question, answer, final]} />);
    expect(screen.queryByLabelText("Jawaban AI sementara")).toBeNull();
    expect(screen.queryByText("Apa pesan utamanya?")).toBeNull();
    expect(within(screen.getByRole("log")).getAllByText(final.content)).toHaveLength(1);
    expect(within(screen.getByRole("log")).getAllByText(answer.content)).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Kualitas" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("prepares an opening without inventing text and accepts a final replay with no deltas", () => {
    const props = chatProps({ messages: [], streaming: { kind: "opening", text: "", outgoing: "" } });
    const { rerender } = render(<VideoChat {...props} />);
    expect(screen.getByRole("status").textContent).not.toBe("");
    expect(screen.queryByLabelText("Jawaban AI sementara")).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    rerender(<VideoChat {...props} messages={[question]} streaming={null} />);
    expect(within(screen.getByRole("log")).getByText(question.content)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pekerja" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps controls locked after text stops until final saving finishes", async () => {
    const completion = deferred<VideoChatSendOutcome>();
    const props = chatProps({ onSend: vi.fn(() => completion.promise) });
    const { rerender } = render(<VideoChat {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Pekerja" }));
    rerender(<VideoChat {...props} streaming={{ kind: "send", text: "Pertanyaan baru", outgoing: "" }} />);
    rerender(<VideoChat {...props} streaming={null} />);
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Pekerja" })).toBeNull();
    await act(async () => { completion.resolve({ ok: true }); });
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("locks opening retries synchronously and unlocks after the request settles", async () => {
    const completion = deferred<void>();
    const onRetryOpening = vi.fn(() => completion.promise);
    render(<VideoChat {...chatProps({ messages: [], openingError: "Percakapan gagal dimulai.", onRetryOpening })} />);
    const retry = screen.getByRole("button", { name: "Coba mulai percakapan lagi" });
    act(() => { fireEvent.click(retry); fireEvent.click(retry); });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(onRetryOpening).toHaveBeenCalledTimes(1);
    await act(async () => { completion.resolve(); });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
  });

  it("requires opening reconciliation before exposing an opening retry", () => {
    const props = chatProps({
      messages: [], openingError: "Percakapan belum dapat dimulai.",
      recoveryError: "Muat ulang percakapan sebelum mencoba lagi.", onRetryOpening: vi.fn(),
    });
    const { rerender } = render(<VideoChat {...props} />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Muat ulang percakapan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Coba mulai percakapan lagi" })).toBeNull();
    rerender(<VideoChat {...props} recoveryError="" />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Muat ulang percakapan" })).toBeNull();
    expect((screen.getByRole("button", { name: "Coba mulai percakapan lagi" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks resending until failed reconciliation is reloaded through the workspace", () => {
    const onSend = vi.fn();
    const onReloadConversation = vi.fn();
    const props = chatProps({ recoveryError: "Koneksi terputus. Muat ulang percakapan sebelum mengirim lagi.", onSend, onReloadConversation });
    const { rerender } = render(<VideoChat {...props} />);
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Pekerja" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pekerja" }));
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Muat ulang percakapan" }));
    expect(onReloadConversation).toHaveBeenCalledTimes(1);
    rerender(<VideoChat {...props} recovering />);
    expect((screen.getByRole("button", { name: "Muat ulang percakapan" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<VideoChat {...props} recoveryError="" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Pesan Anda") as HTMLTextAreaElement).disabled).toBe(false);
  });
});
