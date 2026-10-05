import { internalModuleById } from "../modules/registry";
import { isInternalModuleId } from "../modules/ids";
import { briefValues, isBriefFieldSatisfied, residual } from "../facts";
import type { CompositionSpec } from "../composition";
import type { Catalog } from "../catalog";
import type { VideoRecipe } from "../recipes/types";
import type { ValidationBrief, ValidationIssue } from "./types";

/** Fact safety: the recipe's required brief fields must be filled, and every text slot must be assembled from values the brief already contains.
 * A catalog slot is checked only when the catalog describes it as a string; a colour or an image id is not a claim. */
export function validateFacts(spec: CompositionSpec, brief: ValidationBrief, recipe: VideoRecipe, catalog: Catalog): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of recipe.required) {
    if (!isBriefFieldSatisfied(brief, field)) {
      issues.push({ code: "recipe_field_missing", message: `The ${recipe.id} recipe needs the ${field} field, which the brief does not have.` });
    }
  }

  const allowed = briefValues(brief);
  for (const scene of spec.scenes) {
    for (const instance of scene.modules) {
      for (const [slot, value] of Object.entries(instance.content)) {
        if (value.trim().length === 0) continue;
        if (!isTextSlot(instance.kind, instance.id, slot, catalog)) continue;

        if (value.includes("http")) {
          issues.push({ code: "fact_untraceable", message: `${instance.id}.${slot} references a remote resource.`, sceneId: scene.id, moduleId: instance.id });
          continue;
        }
        const leftover = residual(value, allowed);
        if (leftover.length > 0) {
          issues.push({
            code: "fact_untraceable",
            message: `${instance.id}.${slot} contains text the brief does not support: "${leftover}".`,
            sceneId: scene.id,
            moduleId: instance.id,
          });
        }
      }
    }
  }

  return issues;
}

export function isTextSlot(kind: "internal" | "catalog", id: string, slot: string, catalog: Catalog): boolean {
  if (kind === "internal") {
    if (!isInternalModuleId(id)) return true;
    return internalModuleById(id).slots.find((candidate) => candidate.name === slot)?.kind === "text";
  }
  const variable = catalog.details.get(id)?.variables.find((candidate) => candidate.id === slot);
  return variable?.type === "string";
}
