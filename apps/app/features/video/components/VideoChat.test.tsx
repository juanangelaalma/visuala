// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoChat } from "./VideoChat";

describe("VideoChat", () => {
  it("uses the callback, preserves its existing shell, and shows a recoverable failure", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onSend = vi.fn().mockRejectedValue(new Error("offline"));
    render(<VideoChat messages={[{ id: "hello", role: "assistant", content: "Apa yang ingin dibuat?", controls: null, assetIds: [], createdAt: "now" }]} onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("Pesan Anda"), { target: { value: "Halo" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Pesan tidak dapat dikirim. Coba lagi.");
    expect(onSend).toHaveBeenCalledWith("Halo", undefined);
  });

  const question = { id: "question", role: "assistant" as const, content: "Siapa targetnya?", assetIds: [], createdAt: "now", controls: {
    question: "Siapa targetnya?", control: "multi_select" as const, options: [{ id: "a", label: "Mahasiswa", detail: null }, { id: "b", label: "Pekerja", detail: null }], recommendedOptionId: null, recommendationReason: null, targetFields: ["audience"], briefComplete: false,
  } };

  it("shows an outgoing answer immediately and closes choices on a multi-select click", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onSend = vi.fn(() => new Promise<never>(() => {}));
    render(<VideoChat messages={[question]} onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "Mahasiswa" }));
    expect(within(screen.getByRole("log")).getByText("Mahasiswa")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pekerja" })).toBeNull();
    expect(onSend).toHaveBeenCalledWith("Mahasiswa", undefined);
  });

  it("shows a typed answer on the user's side before the AI responds", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onSend = vi.fn(() => new Promise<never>(() => {}));
    render(<VideoChat messages={[question]} onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("Pesan Anda"), { target: { value: "Pemilik kedai" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    const bubble = within(screen.getByRole("log")).getByText("Pemilik kedai");
    expect(bubble.parentElement?.className).toContain("justify-end");
    expect(screen.queryByRole("button", { name: "Pekerja" })).toBeNull();
    expect(onSend).toHaveBeenCalledWith("Pemilik kedai", undefined);
  });

  it("restores the choices when sending fails", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<VideoChat messages={[question]} onSend={vi.fn().mockRejectedValue(new Error("offline"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Mahasiswa" }));
    expect(await screen.findByRole("button", { name: "Pekerja" })).toBeTruthy();
    expect(within(screen.getByRole("log")).queryByText("Mahasiswa")).toBeNull();
  });

  it("replaces the temporary answer with the saved exchange without duplicates", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const answer = { id: "answer", role: "user" as const, content: "Mahasiswa", controls: null, assetIds: [], createdAt: "now" };
    const nextQuestion = { ...question, id: "next", content: "Apa pesan utamanya?", controls: null };
    const onSend = vi.fn().mockResolvedValue({ message: answer, reply: nextQuestion });
    const { rerender } = render(<VideoChat messages={[question]} onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "Mahasiswa" }));
    expect(await screen.findByText("Apa pesan utamanya?")).toBeTruthy();
    rerender(<VideoChat messages={[question, answer, nextQuestion]} onSend={onSend} />);
    expect(within(screen.getByRole("log")).getAllByText("Mahasiswa")).toHaveLength(1);
    expect(within(screen.getByRole("log")).getAllByText("Apa pesan utamanya?")).toHaveLength(1);
  });
});
