import { describe, expect, it } from "vitest";
import { parseDesignPackManifest } from "../design-pack";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INTERNAL_MODULE_IDS } from "./ids";
import { INTERNAL_MODULES, internalModuleById, moduleVersions } from "./registry";
import type { ModuleBuildInput } from "./types";

const designPack = parseDesignPackManifest(
  JSON.parse(readFileSync(resolve(process.cwd(), "design-packs/creative-mode/v1/manifest.json"), "utf8")),
);

const ASSETS = [{ id: "asset-1", fileName: "asset-1.jpg" }];

function input(overrides: Partial<ModuleBuildInput> = {}): ModuleBuildInput {
  return { designPack, aspectRatio: "9:16", content: {}, assets: ASSETS, ...overrides };
}

describe("internal module registry", () => {
  it("covers the allowlist exactly", () => {
    expect(INTERNAL_MODULES.map((module) => module.id)).toEqual([...INTERNAL_MODULE_IDS]);
    expect(moduleVersions()).toEqual(Object.fromEntries(INTERNAL_MODULE_IDS.map((id) => [id, "1.0.0"])));
  });

  it("throws for an unknown module id", () => {
    expect(() => internalModuleById("Nope" as never)).toThrow(/No internal module/);
  });

  it("declares a semver version, at least one slot, and supported ratios for every module", () => {
    for (const module of INTERNAL_MODULES) {
      expect(module.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(module.slots.length).toBeGreaterThan(0);
      expect(module.supportedRatios.length).toBeGreaterThan(0);
      for (const ratio of module.supportedRatios) expect(["9:16", "1:1", "16:9"]).toContain(ratio);
    }
  });
});

describe("module builds", () => {
  it("renders every module with its required slots filled", () => {
    const content: Record<string, Record<string, string>> = {
      ProductHero: { assetId: "asset-1" },
      Headline: { text: "Julumpia" },
      SupportingCopy: { text: "Rasa otentik sejak 1998." },
      OfferBadge: { text: "Diskon 20%" },
      Price: { value: "Rp25.000", label: "per porsi" },
      BrandMark: { text: "Julumpia" },
      CTA: { text: "Pesan sekarang" },
      BackgroundTexture: { tone: "cream2" },
    };

    for (const module of INTERNAL_MODULES) {
      const output = module.build(input({ content: content[module.id] ?? {} }));
      expect(output.html).toContain(`hf-${module.id}`);
      expect(output.css).toContain(`.hf-${module.id}`);
      expect(output.html).not.toContain("undefined");
    }
  });

  it("escapes markup in every slot", () => {
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
    expect(output.css).toContain("var(--hf-cream)");
  });

  it("is deterministic", () => {
    const module = internalModuleById("Price");
    const args = input({ content: { value: "Rp25.000", label: "per porsi" } });

    expect(module.build(args)).toEqual(module.build(args));
  });

  it("steps the headline ramp down as the text grows", () => {
    const module = internalModuleById("Headline");
    const size = (text: string) => /data-size="([a-z]+)"/.exec(module.build(input({ content: { text } })).html)?.[1];

    expect(size("Julumpia")).toBe("hero");
    expect(size("Diskon dua puluh persen")).toBe("xl");
    expect(size("Nikmati diskon dua puluh persen hari ini")).toBe("lg");
  });
});
