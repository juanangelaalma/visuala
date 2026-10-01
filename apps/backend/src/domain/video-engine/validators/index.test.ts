import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPOSITION_SPEC_VERSION, sceneTimeline, totalFrames } from "../composition";
import { parseDesignPackManifest } from "../design-pack";
import { parseCatalogRows, buildCatalog } from "../catalog";
import type { Catalog } from "../catalog";
import { buildFallbackSpec } from "../fallback";
import { RECIPES, recipeById } from "../recipes/registry";
import { validateComposition } from "./index";
import { validateStoryboard } from "./storyboard-validator";
import type { ValidationBrief, ValidationInput } from "./types";
import type { CompositionSpec } from "../composition";

const designPack = parseDesignPackManifest(
  JSON.parse(readFileSync(resolve(process.cwd(), "design-packs/creative-mode/v1/manifest.json"), "utf8")),
);

const CATALOG: Catalog = buildCatalog(
  parseCatalogRows({
    items: [
      { name: "heygen-avatar-promo-card", type: "block", title: "Avatar Promo Card", description: "portrait offer card", tags: ["promotion"], dimensions: { width: 1080, height: 1920 }, duration: 10 },
      { name: "wide-offer-board", type: "block", title: "Wide Offer Board", description: "landscape offer board", tags: ["promotion"], dimensions: { width: 1920, height: 1080 }, duration: 20 },
      { name: "short-offer-badge", type: "block", title: "Short Offer Badge", description: "portrait offer badge", tags: ["offer"], dimensions: { width: 1080, height: 1920 }, duration: 3 },
    ],
  }),
  new Map(),
);

const BRIEF: ValidationBrief = {
  productName: "Julumpia",
  brandName: "Julumpia",
  keyMessage: "Diskon 20% untuk semua menu",
  callToAction: "Pesan sekarang",
  orderDestination: null,
  audience: null,
  objective: null,
  productCategory: null,
  offer: { label: "Diskon 20%", detail: "Berlaku hari ini" },
  menuItems: null,
};

const ASSETS = [{ id: "asset-1" }];

function spec(overrides: Partial<CompositionSpec> = {}): CompositionSpec {
  return {
    schemaVersion: COMPOSITION_SPEC_VERSION,
    format: { aspectRatio: "9:16", fps: 30, durationSeconds: 12 },
    style: { id: "creative-mode", version: "1" },
    scenes: [
      { id: "scene_1", transition: "cut", modules: [{ id: "ProductHero", kind: "internal", content: { assetId: "asset-1" } }], durationFrames: 120 },
      {
        id: "scene_2",
        modules: [
          { id: "Headline", kind: "internal", content: { text: "Julumpia" } },
          { id: "OfferBadge", kind: "internal", content: { text: "Diskon 20%" } },
        ],
        durationFrames: 120,
      },
      { id: "scene_3", modules: [{ id: "CTA", kind: "internal", content: { text: "Pesan sekarang" } }], durationFrames: 120 },
    ],
    ...overrides,
  };
}

function input(overrides: Partial<ValidationInput> = {}): ValidationInput {
  return { spec: spec(), catalog: CATALOG, recipe: recipeById("discount_promo"), designPack, brief: BRIEF, assets: ASSETS, ...overrides };
}

function codes(value: ValidationInput): string[] {
  return validateComposition(value).issues.map((issue) => issue.code);
}

describe("composition schema", () => {
  it("accepts a well-formed spec", () => {
    expect(validateComposition(input()).ok).toBe(true);
  });

  it("reports structure problems and stops there", () => {
    const report = validateComposition(input({ spec: { ...spec(), scenes: [] } as never }));

    expect(report.ok).toBe(false);
    expect(report.issues.every((issue) => issue.code === "schema_invalid")).toBe(true);
  });

  it("refuses an unsupported aspect ratio and an out-of-range duration", () => {
    expect(codes(input({ spec: { ...spec(), format: { aspectRatio: "4:3", fps: 30, durationSeconds: 12 } } as never }))).toContain("schema_invalid");
    expect(codes(input({ spec: { ...spec(), format: { aspectRatio: "9:16", fps: 30, durationSeconds: 40 } } as never }))).toContain("schema_invalid");
  });
});

describe("catalog validator", () => {
  it("refuses an internal module outside the allowlist", () => {
    const bad = spec();
    bad.scenes[0]!.modules[0]!.id = "NotAModule";

    expect(codes(input({ spec: bad }))).toContain("internal_module_unknown");
  });

  it("refuses a catalog item the discovery file does not know", () => {
    const withCatalog = spec();
    withCatalog.scenes[1]!.modules.push({ id: "mystery-block", kind: "catalog", content: {} });

    expect(codes(input({ spec: withCatalog }))).toContain("catalog_item_unknown");
  });
});

describe("fact validator", () => {
  it("refuses a discount the brief never stated", () => {
    const bad = spec();
    bad.scenes[1]!.modules[1]!.content.text = "Diskon 50%";

    expect(codes(input({ spec: bad }))).toContain("fact_untraceable");
  });

  it("refuses an invented price", () => {
    const bad = spec();
    bad.scenes[2]!.modules.push({ id: "Price", kind: "internal", content: { value: "Rp9.999" } });

    expect(codes(input({ spec: bad }))).toContain("fact_untraceable");
  });

  it("accepts text assembled from brief values", () => {
    const good = spec();
    good.scenes[1]!.modules[0]!.content.text = "Julumpia Diskon 20%";

    expect(codes(input({ spec: good }))).not.toContain("fact_untraceable");
  });

  it("refuses a remote reference", () => {
    const bad = spec();
    bad.scenes[2]!.modules[0]!.content.text = "https://example.com";

    expect(codes(input({ spec: bad }))).toContain("fact_untraceable");
  });

  it("reports a recipe field the brief cannot fill", () => {
    expect(codes(input({ brief: { ...BRIEF, offer: null } }))).toContain("recipe_field_missing");
  });
});

describe("asset validator", () => {
  it("refuses an asset the render was not given", () => {
    const bad = spec();
    bad.scenes[0]!.modules[0]!.content.assetId = "other-asset";

    expect(codes(input({ spec: bad }))).toContain("asset_unknown");
  });

  it("refuses a missing required slot", () => {
    const bad = spec();
    bad.scenes[0]!.modules[0]!.content = {};

    expect(codes(input({ spec: bad }))).toContain("asset_slot_missing");
  });

  it("refuses to silently omit every uploaded asset", () => {
    const bad = spec();
    bad.scenes[0]!.modules = [{ id: "BrandMark", kind: "internal", content: { text: "Julumpia" } }];

    expect(codes(input({ spec: bad }))).toContain("asset_unused");
  });
});

describe("duration validator", () => {
  it("refuses a timeline longer than the requested video", () => {
    const bad = spec();
    bad.scenes[2]!.durationFrames = 200;

    expect(codes(input({ spec: bad }))).toContain("duration_exceeded");
  });

  it("refuses a scene shorter than half a second", () => {
    const bad = spec();
    bad.scenes[0]!.durationFrames = 5;
    bad.scenes[1]!.durationFrames = 175;

    expect(codes(input({ spec: bad }))).toContain("scene_too_short");
  });
});

describe("compatibility validator", () => {
  it("refuses a landscape block in a portrait video", () => {
    const bad = spec();
    bad.scenes[1]!.modules.push({ id: "wide-offer-board", kind: "catalog", content: {} });

    expect(codes(input({ spec: bad }))).toContain("catalog_ratio_incompatible");
  });

  it("refuses a block that outlasts its scene", () => {
    const bad = spec();
    bad.scenes[0]!.durationFrames = 90;
    bad.scenes[1]!.durationFrames = 150;
    bad.scenes[1]!.modules.push({ id: "wide-offer-board", kind: "catalog", content: {} });

    const landscape: Catalog = buildCatalog(
      parseCatalogRows({
        items: [
          { name: "wide-offer-board", type: "block", title: "Wide", description: "", tags: [], dimensions: { width: 1080, height: 1920 }, duration: 20 },
        ],
      }),
      new Map(),
    );

    expect(codes(input({ spec: bad, catalog: landscape }))).toContain("catalog_duration_exceeded");
  });
});

describe("scene timeline", () => {
  it("walks scenes in order", () => {
    expect(sceneTimeline(spec())).toEqual([
      { id: "scene_1", startFrames: 0, durationFrames: 120, transition: "cut", motion: "staged_reveal" },
      { id: "scene_2", startFrames: 120, durationFrames: 120, transition: "slide", motion: "staged_reveal" },
      { id: "scene_3", startFrames: 240, durationFrames: 120, transition: "slide", motion: "staged_reveal" },
    ]);
    expect(totalFrames(spec())).toBe(360);
  });
});

describe("fallback composition", () => {
  const format = { aspectRatio: "9:16", fps: 30, durationSeconds: 12 } as const;

  it("passes every validator", () => {
    const fallback = buildFallbackSpec({ designPack, format, recipe: recipeById("discount_promo"), brief: BRIEF, assets: ASSETS });

    expect(validateComposition(input({ spec: fallback })).ok).toBe(true);
  });

  it("still passes with no assets and no offer", () => {
    const fallback = buildFallbackSpec({ designPack, format, recipe: recipeById("product_promo"), brief: { ...BRIEF, offer: null }, assets: [] });
    const report = validateComposition(input({ spec: fallback, recipe: recipeById("product_promo"), brief: { ...BRIEF, offer: null }, assets: [] }));

    expect(report.ok).toBe(true);
    expect(fallback.scenes[0]!.modules.map((module) => module.id)).toContain("BrandMark");
  });

  it("uses only internal modules", () => {
    const fallback = buildFallbackSpec({ designPack, format, recipe: recipeById("discount_promo"), brief: BRIEF, assets: ASSETS });

    expect(fallback.scenes.flatMap((scene) => scene.modules).every((module) => module.kind === "internal")).toBe(true);
  });
});

describe("planned storyboard semantics", () => {
  const format = { aspectRatio: "9:16", fps: 30, durationSeconds: 12 } as const;
  const fallback = () => buildFallbackSpec({ designPack, format, recipe: recipeById("discount_promo"), brief: BRIEF, assets: ASSETS });

  it("allows the confirmed key message as subordinate product and closing support", () => {
    const value = fallback();
    value.scenes[0]!.modules.push({ id: "SupportingCopy", kind: "internal", content: { text: BRIEF.keyMessage } });

    expect(validateStoryboard(input({ spec: value }))).toEqual([]);
  });

  it("refuses the key message as a rival product headline", () => {
    const value = fallback();
    value.scenes[0]!.modules.find((module) => module.id === "Headline")!.content.text = BRIEF.keyMessage;

    expect(validateStoryboard(input({ spec: value })).map((issue) => issue.code)).toContain("beat_focus_invalid");
  });

  it.each([
    {
      name: "brand and headline repeat the product name",
      code: "copy_repeated",
      change: (value: CompositionSpec) => value.scenes[0]!.modules.push({ id: "BrandMark", kind: "internal", content: { text: "JULUMPIA!" } }),
    },
    {
      name: "offer headline repeats the badge inside a longer phrase",
      code: "copy_repeated",
      change: (value: CompositionSpec) => value.scenes[1]!.modules.push({ id: "Headline", kind: "internal", content: { text: BRIEF.keyMessage } }),
    },
    {
      name: "CTA appears before closing",
      code: "cta_not_closing",
      change: (value: CompositionSpec) => value.scenes[0]!.modules.push({ id: "CTA", kind: "internal", content: { text: BRIEF.callToAction! } }),
    },
    {
      name: "product_push is assigned to the offer",
      code: "motion_incompatible",
      change: (value: CompositionSpec) => { value.scenes[1]!.motion = "product_push"; },
    },
    {
      name: "the product beat shows the offer instead",
      code: "beat_focus_invalid",
      change: (value: CompositionSpec) => { value.scenes[0]!.modules = value.scenes[1]!.modules; },
    },
    {
      name: "recipe beats are reordered",
      code: "beat_order_invalid",
      change: (value: CompositionSpec) => { [value.scenes[0], value.scenes[1]] = [value.scenes[1]!, value.scenes[0]!]; },
    },
  ])("rejects $name", ({ code, change }) => {
    const value = fallback();
    change(value);
    expect(validateStoryboard(input({ spec: value })).map((issue) => issue.code)).toContain(code);
  });

  it.each(RECIPES.flatMap((recipe) => [true, false].map((withAssets) => ({ recipe, withAssets }))))(
    "fallback realises $recipe.id with assets=$withAssets",
    ({ recipe, withAssets }) => {
      const brief = {
        ...BRIEF, audience: "pelanggan", objective: "kunjungan", orderDestination: "WhatsApp 08123",
        menuItems: [{ name: "Julumpia", price: "Rp10.000" }, { name: "Lumpia", price: null }],
      };
      const assets = withAssets ? ASSETS : [];
      const value = buildFallbackSpec({ designPack, format, recipe, brief, assets });
      const validation = input({ spec: value, recipe, brief, assets });

      expect([...validateComposition(validation).issues, ...validateStoryboard(validation)]).toEqual([]);
      expect(totalFrames(value)).toBe(format.fps * format.durationSeconds);
    },
  );
});

describe("candidate gate", () => {
  it("refuses a catalog item the planner was never offered", () => {
    const report = validateComposition(input({ spec: withCatalogItem("short-offer-badge"), candidateIds: ["heygen-avatar-promo-card"] }));

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(["catalog_item_not_candidate"]);
  });

  it("accepts an offered catalog item", () => {
    const report = validateComposition(input({ spec: withCatalogItem("short-offer-badge"), candidateIds: ["short-offer-badge"] }));

    expect(report.ok).toBe(true);
  });

  it("leaves the candidate rule off when no shortlist was passed", () => {
    expect(validateComposition(input({ spec: withCatalogItem("short-offer-badge") })).ok).toBe(true);
  });
});

/** The default spec with one catalog block layered into its middle scene. */
function withCatalogItem(name: string): CompositionSpec {
  const base = spec();
  return {
    ...base,
    scenes: [
      base.scenes[0]!,
      { ...base.scenes[1]!, modules: [...base.scenes[1]!.modules, { id: name, kind: "catalog" as const, content: {} }] },
      base.scenes[2]!,
    ],
  };
}
