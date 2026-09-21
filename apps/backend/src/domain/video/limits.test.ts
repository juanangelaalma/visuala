import { describe, expect, it } from "vitest";
import { MAX_RERENDERS_PER_PROJECT, readAssetLimits } from "./limits";

describe("video limits", () => {
  it("caps rerenders at the PRD limit", () => {
    expect(MAX_RERENDERS_PER_PROJECT).toBe(3);
  });

  it("falls back to the documented defaults", () => {
    expect(readAssetLimits({})).toEqual({ maxAssetsPerProject: 8, maxProjectAssetBytes: 41943040, minImageDimension: 200, maxImageDimension: 8000 });
  });

  it("honours an environment override and rejects a non-numeric one", () => {
    expect(readAssetLimits({ VIDEO_MAX_ASSETS_PER_PROJECT: "3" }).maxAssetsPerProject).toBe(3);
    expect(() => readAssetLimits({ VIDEO_MAX_ASSETS_PER_PROJECT: "many" })).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
  });
});
