// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VideoPromptBar, { createVideoPromptSubmission } from "./VideoPromptBar";

describe("VideoPromptBar", () => {
  it("renders the video prompt controls in their initial state", () => {
    const markup = renderToStaticMarkup(createElement(VideoPromptBar));

    expect(markup).toContain('aria-label="Describe your video"');
    expect(markup).toContain('aria-label="Attach files"');
    expect(markup).toContain('aria-label="Choose video duration"');
    expect(markup).toContain("60 detik");
    expect(markup).toContain("Iklan jasa");
    expect(markup).toContain('aria-label="Create video" disabled=""');
  });

  it("builds a trimmed submission without dropping its duration or files", () => {
    const files = [new File(["frame"], "frame.png", { type: "image/png" })];

    expect(createVideoPromptSubmission({ prompt: "  Buat iklan kopi  ", durationSeconds: 30, files })).toEqual({
      prompt: "Buat iklan kopi",
      durationSeconds: 30,
      files,
    });
  });

  it("submits the current prompt, duration, and attachment", () => {
    const onSubmit = vi.fn();
    const file = new File(["frame"], "frame.png", { type: "image/png" });
    const { container } = render(createElement(VideoPromptBar, { onSubmit }));

    fireEvent.change(screen.getByLabelText("Describe your video"), { target: { value: "  Buat iklan kopi  " } });
    fireEvent.change(screen.getByLabelText("Choose video duration"), { target: { value: "30" } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText("Create video"));

    expect(onSubmit).toHaveBeenCalledWith({ prompt: "Buat iklan kopi", durationSeconds: 30, files: [file] });
  });
});
