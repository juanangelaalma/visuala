import type { Catalog } from "../catalog";
import type { CompositionSpec } from "../composition";
import type { DesignPackManifest } from "../design-pack";
import type { VideoRecipe } from "../recipes/types";

/** The brief as the validators read it. Deliberately narrow: only what a composition may quote. */
export type ValidationBrief = {
  productName: string;
  brandName: string | null;
  keyMessage: string;
  callToAction: string | null;
  orderDestination: string | null;
  audience: string | null;
  objective: string | null;
  productCategory: string | null;
  offer: { label: string; detail: string } | null;
  menuItems: readonly { name: string; price: string | null }[] | null;
};

export type ValidationCode =
  | "schema_invalid"
  | "catalog_item_unknown"
  | "catalog_item_not_candidate"
  | "internal_module_unknown"
  | "fact_untraceable"
  | "recipe_field_missing"
  | "asset_unknown"
  | "asset_slot_missing"
  | "asset_unused"
  | "duration_exceeded"
  | "scene_too_short"
  | "ratio_unsupported"
  | "catalog_ratio_incompatible"
  | "catalog_duration_exceeded";

export type ValidationIssue = {
  code: ValidationCode;
  message: string;
  sceneId?: string;
  moduleId?: string;
};

export type ValidationInput = {
  spec: CompositionSpec;
  catalog: Catalog;
  recipe: VideoRecipe;
  designPack: DesignPackManifest;
  brief: ValidationBrief;
  /** Assets this render was given. Ownership is settled before validation; this is the given set. */
  assets: readonly { id: string }[];
  /** When set, the only catalog ids the plan was offered: the planner may not name an item it never saw. */
  candidateIds?: readonly string[];
};

export type ValidationReport = {
  ok: boolean;
  issues: readonly ValidationIssue[];
};

export function report(issues: readonly ValidationIssue[]): ValidationReport {
  return { ok: issues.length === 0, issues };
}
