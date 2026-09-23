// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoChat } from "./VideoChat";

describe("VideoChat", () => {
  it("uses the callback, preserves its existing shell, and shows a recoverable failure", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onSend = vi.fn().mockRejectedValue(new Error("offline"));
    const { asFragment } = render(<VideoChat messages={[]} onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("Pesan Anda"), { target: { value: "Halo" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Pesan tidak dapat dikirim. Coba lagi.");
    expect(onSend).toHaveBeenCalledWith("Halo", undefined);
    expect(asFragment()).toMatchSnapshot();
  });
});
