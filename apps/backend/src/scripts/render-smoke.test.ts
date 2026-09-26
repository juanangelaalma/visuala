import { describe, expect, it, vi } from "vitest";
import { buildSmokeContent, parseSmokeOptions, runValidatedSmoke } from "./render-smoke-options";

const assetId = "00000000-0000-4000-8000-000000000006";
const standardScene = (order: number, startSeconds: number, endSeconds: number, onScreenCopy: string) => ({
  order,
  startSeconds,
  endSeconds,
  visual: "smoke",
  onScreenTitle: "Smoke",
  onScreenCopy,
  voiceOver: null,
  caption: null,
  assetIds: [assetId],
  audioCue: null,
  transition: "fade" as const,
});
const standardBrief = {
  productName: "Smoke",
  brandName: null,
  keyMessage: "Smoke",
  callToAction: null,
  orderDestination: null,
  menuItems: null,
};

describe("render smoke options", () => {
  it("keeps the existing defaults", () => {
    expect(parseSmokeOptions([])).toMatchObject({
      templateId: "product-spotlight",
      styleId: "bold_pop",
      content: "standard",
      aspectRatio: "9:16",
      resolution: "720p",
      durationSeconds: 6,
      keep: false,
    });
  });

  it.each([
    ["unknown flag", ["--unknown"]],
    ["positional argument", ["unknown"]],
    ["duplicate value flag", ["--duration", "6", "--duration", "10"]],
    ["duplicate keep flag", ["--keep", "--keep"]],
    ["missing value", ["--style"]],
    ["flag as value", ["--style", "--keep"]],
    ["assigned value", ["--duration=6"]],
    ["false keep value", ["--keep=false"]],
    ["value after keep", ["--keep", "false"]],
  ])("rejects malformed CLI grammar: %s", (_, args) => {
    expect(() => parseSmokeOptions(args)).toThrow("Invalid smoke command arguments.");
  });

  it.each([
    ["--template", "unknown"],
    ["--style", "unknown"],
    ["--content", "unknown"],
    ["--aspect-ratio", "4:3"],
    ["--resolution", "4k"],
    ["--duration", "7"],
  ])("rejects unsupported %s values", (flag, value) => {
    expect(() => parseSmokeOptions([flag, value])).toThrow();
  });

  it("rejects invalid CLI before invoking side-effectful work", async () => {
    const execute = vi.fn();
    await expect(runValidatedSmoke(["--keep=false"], execute)).rejects.toThrow("Invalid smoke command arguments.");
    expect(execute).not.toHaveBeenCalled();
  });

  it("builds the complete standard fixture", () => {
    expect(buildSmokeContent("standard", 6)).toEqual({
      scenes: [standardScene(1, 0, 3, "Scene one"), standardScene(2, 3, 6, "Scene two")],
      brief: standardBrief,
    });
  });

  it("builds the complete long fixture", () => {
    const longScene = (order: number, startSeconds: number, endSeconds: number) => ({
      ...standardScene(order, startSeconds, endSeconds, "B".repeat(90)),
      onScreenTitle: "A".repeat(40),
    });
    expect(buildSmokeContent("long", 10)).toEqual({
      scenes: [longScene(1, 0, 5), longScene(2, 5, 10)],
      brief: { ...standardBrief, callToAction: "C".repeat(80) },
    });
  });

  it("builds the complete menu fixture", () => {
    expect(buildSmokeContent("menu", 6)).toEqual({
      scenes: [standardScene(1, 0, 3, "Scene one"), standardScene(2, 3, 6, "Scene two")],
      brief: {
        ...standardBrief,
        menuItems: [
          { name: "Kopi Susu", price: "Rp25.000" },
          { name: "Teh Melati", price: "Rp15.000" },
          { name: "Roti Bakar", price: "Rp20.000" },
        ],
      },
    });
  });

  it("builds the complete short fixture without changing total duration", () => {
    const shortScene = (order: number, startSeconds: number, endSeconds: number, onScreenCopy: string) => ({
      ...standardScene(order, startSeconds, endSeconds, onScreenCopy),
      onScreenTitle: "Fresh",
    });
    expect(buildSmokeContent("short", 15)).toEqual({
      scenes: [shortScene(1, 0, 0.5, "Now"), shortScene(2, 0.5, 15, "Order today")],
      brief: standardBrief,
    });
  });
});
