import { describe, expect, it } from "vitest";
import { parseDesignPackManifest } from "../design-pack";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { internalModuleById } from "./registry";
import type { ModuleBuildInput } from "./types";

const designPack = parseDesignPackManifest(
  JSON.parse(readFileSync(resolve(process.cwd(), "design-packs/creative-mode/v1/manifest.json"), "utf8")),
);

const ASSETS = [{ id: "asset-1", fileName: "asset-1.jpg" }];

function input(overrides: Partial<ModuleBuildInput> = {}): ModuleBuildInput {
  return { designPack, aspectRatio: "9:16", content: {}, assets: ASSETS, ...overrides };
}

describe("internal module registry", () => {
  it("throws for an unknown module id", () => {
    expect(() => internalModuleById("Nope" as never)).toThrow(/No internal module/);
  });
});

describe("module builds", () => {
  it("escapes user markup", () => {
    const output = internalModuleById("Headline").build(input({ content: { text: '<script>alert("x")</script>' } }));

    expect(output.html).not.toContain("<script>");
    expect(output.html).toContain("&lt;script&gt;");
    expect(output.html).toContain("&quot;");
  });

  it("refuses a missing required slot", () => {
    expect(() => internalModuleById("Headline").build(input({ content: {} }))).toThrow(/needs the text slot/);
  });

  it("refuses a value past the slot's limit", () => {
    expect(() => internalModuleById("OfferBadge").build(input({ content: { text: "x".repeat(25) } }))).toThrow(/exceeds 24 characters/);
  });

  it("refuses an asset the render was not given", () => {
    expect(() => internalModuleById("ProductHero").build(input({ content: { assetId: "missing" } }))).toThrow(/needs asset missing/);
  });

  it("falls back to the cream ground for an unknown tone", () => {
    const output = internalModuleById("BackgroundTexture").build(input({ content: { tone: "chartreuse" } }));

    expect(output.html).toContain('data-tone="cream"');
  });

  it("is deterministic", () => {
    const module = internalModuleById("Price");
    const args = input({ content: { value: "Rp25.000", label: "per porsi" } });

    expect(module.build(args)).toEqual(module.build(args));
  });
});
