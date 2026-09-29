import { discountPromo } from "./discount-promo";
import { menuShowcase } from "./menu-showcase";
import { productLaunch } from "./product-launch";
import { productPromo } from "./product-promo";
import { storefrontShowcase } from "./storefront-showcase";
import { VIDEO_TYPES } from "../../video/settings";
import type { RecipeId, VideoRecipe } from "./types";

/** The allowlist. The planner picks a look; it never invents a recipe or changes one. */
export const RECIPES: readonly VideoRecipe[] = Object.freeze([
  productPromo,
  discountPromo,
  productLaunch,
  menuShowcase,
  storefrontShowcase,
]);

export function isRecipeId(value: string): value is RecipeId {
  return (VIDEO_TYPES as readonly string[]).includes(value);
}

export function recipeById(id: RecipeId): VideoRecipe {
  const recipe = RECIPES.find((candidate) => candidate.id === id);
  if (!recipe) throw new Error(`No recipe with id ${id}.`);
  return recipe;
}

export type { RecipeId, RecipeBeat, VideoRecipe } from "./types";
