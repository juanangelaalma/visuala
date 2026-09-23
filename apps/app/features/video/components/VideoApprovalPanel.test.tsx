// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoApprovalPanel } from "./VideoApprovalPanel";

describe("VideoApprovalPanel", () => {
  it("uses the callback and preserves its existing panel markup", async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const { asFragment } = render(<VideoApprovalPanel projectId="project-1" briefComplete hasStoryboard approved={false} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole("button", { name: "Setujui brief dan storyboard" }));
    await vi.waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Setujui brief dan storyboard" }).hasAttribute("disabled")).toBe(false));
    expect(asFragment()).toMatchSnapshot();
  });
});
