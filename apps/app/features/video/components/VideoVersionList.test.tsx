// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoVersionList } from "./VideoVersionList";

describe("VideoVersionList", () => {
  it("uses the separately supplied download callback without adding a token to a URL", async () => {
    const onDownloadVersion = vi.fn().mockResolvedValue(undefined);
    const { asFragment } = render(<VideoVersionList projectId="project-1" versions={[{ id: "version-1", versionNumber: 1, durationSeconds: 10, resolution: "1080p", aspectRatio: "9:16", createdAt: "2026-09-22T00:00:00.000Z", playbackUrl: "https://example.test/video.mp4" }]} onDownloadVersion={onDownloadVersion} />);
    fireEvent.click(screen.getByRole("button", { name: "Unduh" }));
    await vi.waitFor(() => expect(onDownloadVersion).toHaveBeenCalledWith("version-1"));
    expect(asFragment()).toMatchSnapshot();
  });
});
