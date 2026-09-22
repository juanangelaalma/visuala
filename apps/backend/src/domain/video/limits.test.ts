import { describe, expect, it } from "vitest";
import { MAX_RERENDERS_PER_PROJECT, readAssetLimits, readRenderLimits } from "./limits";

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

  it("defaults the rendered-output ceiling to 500 MB and reads an override", () => {
    expect(readRenderLimits({}).maxOutputBytes).toBe(524_288_000);
    expect(readRenderLimits({ VIDEO_MAX_RENDER_OUTPUT_BYTES: "1024" }).maxOutputBytes).toBe(1024);
    expect(() => readRenderLimits({ VIDEO_MAX_RENDER_OUTPUT_BYTES: "nope" })).toThrowError();
  });
});
