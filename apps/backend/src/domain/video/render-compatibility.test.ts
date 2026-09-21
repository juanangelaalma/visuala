import { describe, expect, it } from "vitest";
import { RENDER_SUPPORTED_COMBINATIONS, assertRenderCombinationSupported, isRenderCombinationSupported } from "./render-compatibility";

describe("render compatibility", () => {
  it("covers the whole 3 x 2 x 3 matrix the PRD must offer", () => {
    expect(RENDER_SUPPORTED_COMBINATIONS).toHaveLength(18);
    const distinct = new Set(RENDER_SUPPORTED_COMBINATIONS.map((entry) => `${entry.aspectRatio}/${entry.resolution}/${entry.durationSeconds}`));
    expect(distinct.size).toBe(18);
  });

  it("rejects a combination the renderer did not verify", () => {
    expect(isRenderCombinationSupported({ aspectRatio: "4:5" as never, resolution: "720p", durationSeconds: 6 })).toBe(false);
    expect(isRenderCombinationSupported({ aspectRatio: "9:16", resolution: "1080p", durationSeconds: 6 })).toBe(true);
    expect(() => assertRenderCombinationSupported({ aspectRatio: "16:9", resolution: "4k" as never, durationSeconds: 10 }))
      .toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
  });
});
