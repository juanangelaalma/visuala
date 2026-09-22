import { describe, expect, it } from "vitest";
import { RENDER_TEMPLATES, selectTemplate, templateById } from "./registry";
import { VIDEO_ASPECT_RATIOS, VIDEO_TYPES } from "../settings";

describe("template registry", () => {
  it("leaves no video type without a template that declares it, at every aspect ratio", () => {
    for (const videoType of VIDEO_TYPES) {
      for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
        expect(() => selectTemplate({ videoType, aspectRatio })).not.toThrow();
      }
    }
  });

  it("selects deterministically for the same input", () => {
    expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id)
      .toBe(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id);
    expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id).toBe("product-spotlight");
    expect(selectTemplate({ videoType: "menu_showcase", aspectRatio: "9:16" }).id).toBe("offer-board");
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
