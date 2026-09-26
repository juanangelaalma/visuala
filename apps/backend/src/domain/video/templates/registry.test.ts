import { describe, expect, it } from "vitest";
import { RENDER_TEMPLATES, selectTemplate, templateById } from "./registry";
import { VIDEO_ASPECT_RATIOS, VIDEO_STYLE_IDS, VIDEO_TYPES } from "../settings";

describe("template registry", () => {
  it("leaves no video type without a template that declares it, at every aspect ratio", () => {
    for (const videoType of VIDEO_TYPES) {
      for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
        expect(() => selectTemplate({ videoType, aspectRatio })).not.toThrow();
      }
    }
  });

  it("keeps legacy selection without a style", () => {
    expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id).toBe("product-spotlight");
  });

  it("selects deterministically for the same input", () => {
    expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id)
      .toBe(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id);
    expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id).toBe("product-spotlight");
    expect(selectTemplate({ videoType: "menu_showcase", aspectRatio: "9:16" }).id).toBe("offer-board");
  });

  it("maps every style and video type to the approved template for every ratio", () => {
    const expected = {
      product_promo: { bold_pop: "product-spotlight", clean_product: "editorial-split", warm_artisan: "artisan-detail", premium_dark: "gallery-reveal" },
      product_launch: { bold_pop: "kinetic-type", clean_product: "editorial-split", warm_artisan: "artisan-detail", premium_dark: "gallery-reveal" },
      discount_promo: { bold_pop: "offer-takeover", clean_product: "offer-board", warm_artisan: "offer-board", premium_dark: "offer-takeover" },
      menu_showcase: { bold_pop: "menu-sequence", clean_product: "offer-board", warm_artisan: "menu-sequence", premium_dark: "menu-sequence" },
    } as const;
    for (const videoType of VIDEO_TYPES) {
      for (const styleId of VIDEO_STYLE_IDS) {
        for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
          const template = selectTemplate({ videoType, styleId, aspectRatio });
          expect(template.id).toBe(expected[videoType][styleId]);
          expect(template.supports).toContain(videoType);
          expect(template.aspectRatios).toContain(aspectRatio);
        }
      }
    }
  });

  it("versions every template, so a manifest can name the version it rendered with", () => {
    for (const template of RENDER_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(new Set(RENDER_TEMPLATES.map((template) => template.id)).size).toBe(RENDER_TEMPLATES.length);
  });

  it("refuses an unknown id and a version the registry does not hold", () => {
    expect(() => templateById("nope", "1.0.0")).toThrowError(/nope/);
    expect(() => templateById("product-spotlight", "9.9.9")).toThrowError(/version/);
  });
});
