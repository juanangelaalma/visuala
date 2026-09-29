import { describe, expect, it } from "vitest";
import { COMPOSITION_SPEC_VERSION, totalFrames } from "../domain/video-engine/composition";
import { buildSmokeSpec, parseCompositionSmokeOptions } from "./composition-smoke-options";

describe("parseCompositionSmokeOptions", () => {
  it("uses the defaults with no arguments", () => {
    const options = parseCompositionSmokeOptions([]);

    expect(options).toMatchObject({ aspectRatio: "9:16", resolution: "1080p", durationSeconds: 12, fps: 30, quality: "draft", block: null });
  });

  it("reads both --flag value and --flag=value", () => {
    const options = parseCompositionSmokeOptions(["--ratio", "1:1", "--resolution=720p", "--duration", "6", "--block", "badge-pop", "--keep", "--out", "/tmp/x"]);

    expect(options).toMatchObject({ aspectRatio: "1:1", resolution: "720p", durationSeconds: 6, block: "badge-pop", keep: true, outDir: "/tmp/x" });
  });

  it("refuses an unknown flag, a missing value, and an out-of-range value", () => {
    expect(() => parseCompositionSmokeOptions(["--nope"])).toThrow(/Unknown option/);
    expect(() => parseCompositionSmokeOptions(["--ratio"])).toThrow(/needs a value/);
    expect(() => parseCompositionSmokeOptions(["--duration", "45"])).toThrow(/Unsupported duration/);
    expect(() => parseCompositionSmokeOptions(["--ratio", "4:3"])).toThrow(/Unsupported ratio/);
    expect(() => parseCompositionSmokeOptions(["--resolution", "4k"])).toThrow(/Unsupported resolution/);
    expect(() => parseCompositionSmokeOptions(["--fps", "0"])).toThrow(/Unsupported fps/);
    expect(() => parseCompositionSmokeOptions(["--quality", "best"])).toThrow(/Unsupported quality/);
  });
});

describe("buildSmokeSpec", () => {
  const base = { aspectRatio: "9:16" as const, durationSeconds: 12, fps: 30, styleId: "creative-mode", styleVersion: "1" };

  it("builds three scenes that exactly fill the requested duration", () => {
    const spec = buildSmokeSpec(base);

    expect(spec.schemaVersion).toBe(COMPOSITION_SPEC_VERSION);
    expect(spec.scenes).toHaveLength(3);
    expect(totalFrames(spec)).toBe(360);
    expect(spec.scenes.every((scene) => scene.durationFrames >= 15)).toBe(true);
  });

  it("uses a synthetic product beat only when an asset is given", () => {
    expect(buildSmokeSpec(base).scenes[0]?.modules.map((module) => module.id)).toContain("Headline");
    expect(buildSmokeSpec({ ...base, assetId: "asset-1" }).scenes[0]?.modules.map((module) => module.id)).toContain("ProductHero");
  });

  it("hosts the catalog block in the second scene when one is named", () => {
    const spec = buildSmokeSpec({ ...base, block: "badge-pop", blockVars: { count: "3" } });

    expect(spec.scenes[1]?.modules).toEqual([{ id: "badge-pop", kind: "catalog", content: { count: "3" } }]);
  });
});
