import { internalModuleById } from "../modules/registry";
import { isInternalModuleId } from "../modules/ids";
import type { CompositionSpec } from "../composition";
import type { ValidationIssue } from "./types";

/** An asset slot must name an id the render was given, and every required slot must be filled. */
export function validateAssets(spec: CompositionSpec, assets: readonly { id: string }[]): ValidationIssue[] {
  const known = new Set(assets.map((asset) => asset.id));
  const issues: ValidationIssue[] = [];
  let usesKnownAsset = false;

  for (const scene of spec.scenes) {
    for (const instance of scene.modules) {
      if (instance.kind !== "internal" || !isInternalModuleId(instance.id)) continue;
      const module = internalModuleById(instance.id);

      for (const slot of module.slots) {
        const value = instance.content[slot.name] ?? "";
        if (slot.required && value.trim().length === 0) {
          issues.push({ code: "asset_slot_missing", message: `${instance.id} is missing its ${slot.name} slot.`, sceneId: scene.id, moduleId: instance.id });
          continue;
        }
        if (slot.kind !== "asset") continue;

        for (const assetId of value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)) {
          if (!known.has(assetId)) {
            issues.push({ code: "asset_unknown", message: `${instance.id}.${slot.name} names asset ${assetId}, which this render was not given.`, sceneId: scene.id, moduleId: instance.id });
          } else {
            usesKnownAsset = true;
          }
        }
      }
    }
  }

  if (assets.length > 0 && !usesKnownAsset) {
    issues.push({ code: "asset_unused", message: "The composition does not use any of the uploaded assets." });
  }

  return issues;
}
