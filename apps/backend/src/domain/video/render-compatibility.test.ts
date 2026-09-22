import { describe, expect, it } from "vitest";
import { RENDER_SUPPORTED_COMBINATIONS, assertRenderCombinationSupported, isRenderCombinationSupported } from "./render-compatibility";
import { VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS_SECONDS, VIDEO_RESOLUTIONS } from "./settings";
import type { RenderCombination } from "./render-compatibility";

const key = (entry: RenderCombination): string => `${entry.aspectRatio}/${entry.resolution}/${entry.durationSeconds}`;
const byKey = (left: RenderCombination, right: RenderCombination): number => key(left).localeCompare(key(right));

describe("render compatibility", () => {
  /**
   * The spike verified all eighteen rows, so the allowlist has to equal the whole matrix exactly.
   * A dropped row would refuse a combination the renderer produces; an extra row would promise one
   * it was never shown to produce.
   */
  it("equals exactly the eighteen combinations the HyperFrames spike rendered, no more and no less", () => {
    const verified: RenderCombination[] = VIDEO_ASPECT_RATIOS.flatMap((aspectRatio) =>
      VIDEO_RESOLUTIONS.flatMap((resolution) =>
        VIDEO_DURATIONS_SECONDS.map((durationSeconds) => ({ aspectRatio, resolution, durationSeconds })),
      ),
    );

    expect([...RENDER_SUPPORTED_COMBINATIONS].sort(byKey)).toEqual(verified.sort(byKey));
  });

  it("rejects a combination the renderer did not verify", () => {
    expect(isRenderCombinationSupported({ aspectRatio: "4:5" as never, resolution: "720p", durationSeconds: 6 })).toBe(false);
    expect(isRenderCombinationSupported({ aspectRatio: "9:16", resolution: "1080p", durationSeconds: 6 })).toBe(true);
    expect(() => assertRenderCombinationSupported({ aspectRatio: "16:9", resolution: "4k" as never, durationSeconds: 10 }))
      .toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
  });
});
