import { describe, expect, it } from "vitest";
import { isJobActive, renderStatusPresentation, videoAspectClass } from "./render-status-presentation";

describe("renderStatusPresentation", () => {
  it("labels every backend status with the workspace's own copy", () => {
    for (const status of ["queued", "preparing", "rendering", "uploading", "succeeded", "failed", "cancelled"] as const) {
      expect(renderStatusPresentation({ status }).label.length).toBeGreaterThan(0);
    }
  });

  it("says nothing about an error code it does not recognise instead of showing the raw code", () => {
    expect(renderStatusPresentation({ status: "failed", errorCode: "render_weird" }).detail).toBeNull();
  });

  it("explains the two failures a user can act on", () => {
    expect(renderStatusPresentation({ status: "failed", errorCode: "render_timeout" }).detail).toMatch(/terlalu lama|timeout/i);
    expect(renderStatusPresentation({ status: "failed", errorCode: "render_stale" }).detail).toMatch(/terputus|ulang/i);
  });

  it("explains every recognised failure code, so no known failure shows a blank reason", () => {
    for (const errorCode of [
      "render_input_unsupported", "render_asset_missing", "render_asset_mutated", "render_engine_failed",
      "render_engine_unavailable", "render_timeout", "render_output_invalid", "render_output_too_large",
      "render_upload_failed", "render_stale", "render_worker_shutdown",
    ]) {
      expect(renderStatusPresentation({ status: "failed", errorCode }).detail, errorCode).not.toBeNull();
    }
  });

  it("gives a succeeded job no detail, because there is nothing to explain", () => {
    expect(renderStatusPresentation({ status: "succeeded" }).detail).toBeNull();
  });

  it("counts queued, preparing, rendering, and uploading as in flight, and nothing else", () => {
    for (const status of ["queued", "preparing", "rendering", "uploading"] as const) {
      expect(isJobActive({ status })).toBe(true);
    }
    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      expect(isJobActive({ status })).toBe(false);
    }
  });
});

describe("videoAspectClass", () => {
  it("gives every supported ratio its own box, so a 16:9 render is never stretched into a 9:16 one", () => {
    expect(videoAspectClass("9:16")).toBe("aspect-[9/16]");
    expect(videoAspectClass("1:1")).toBe("aspect-square");
    expect(videoAspectClass("16:9")).toBe("aspect-video");
  });

  it("falls back to the portrait box for a ratio the app does not know", () => {
    expect(videoAspectClass("4:3")).toBe("aspect-[9/16]");
  });
});
