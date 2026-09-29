import { describe, expect, it } from "vitest";
import { BRIEF_FIELDS } from "../../video/brief";
import { INTERNAL_MODULE_IDS } from "../modules/ids";
import { RECIPES, recipeById } from "./registry";

const FIELDS = new Set<string>(BRIEF_FIELDS);
const MODULE_IDS = new Set<string>(INTERNAL_MODULE_IDS);

describe("recipes", () => {
  it("defines exactly the five PRD recipes", () => {
    expect(RECIPES.map((recipe) => recipe.id)).toEqual([
      "product_promo",
      "discount_promo",
      "product_launch",
      "menu_showcase",
      "storefront_showcase",
    ]);
  });

  it("gives every recipe a version, a purpose, defaults, and constraints", () => {
    for (const recipe of RECIPES) {
      expect(recipe.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(recipe.purpose.length).toBeGreaterThan(10);
      expect(recipe.defaultDurationSeconds).toBeGreaterThanOrEqual(4);
      expect(recipe.defaultDurationSeconds).toBeLessThanOrEqual(30);
      expect(["9:16", "1:1", "16:9"]).toContain(recipe.defaultAspectRatio);
      expect(recipe.constraints.length).toBeGreaterThan(0);
    }
  });

  it("only requires brief fields the brief actually tracks", () => {
    for (const recipe of RECIPES) {
      expect(recipe.required.length).toBeGreaterThan(0);
      for (const field of recipe.required) expect(FIELDS.has(field)).toBe(true);
    }
  });

  it("only recommends internal modules that exist in the allowlist", () => {
    for (const recipe of RECIPES) {
      expect(recipe.recommendedModules.length).toBeGreaterThan(0);
      for (const moduleId of recipe.recommendedModules) expect(MODULE_IDS.has(moduleId)).toBe(true);
    }
  });

  it("gives every recipe at least two beats with unique ids", () => {
    for (const recipe of RECIPES) {
      expect(recipe.beats.length).toBeGreaterThanOrEqual(2);
      const ids = recipe.beats.map((beat) => beat.id);
      // Beat ids travel to the Art Director and back, so they must satisfy the id charset it validates.
      for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
      expect(new Set(ids).size).toBe(ids.length);
      for (const beat of recipe.beats) expect(beat.intent.length).toBeGreaterThan(3);
    }
  });

  it("requires the offer for a discount promo and menu items for a menu showcase", () => {
    expect(recipeById("discount_promo").required).toContain("offer");
    expect(recipeById("menu_showcase").required).toContain("menuItems");
    expect(recipeById("storefront_showcase").required).toContain("orderDestination");
  });

  it("throws for an unknown recipe id", () => {
    expect(() => recipeById("nope" as never)).toThrow(/No recipe/);
  });
});
