import { catalogItemExists } from "../catalog-search";
import { isInternalModuleId } from "../modules/ids";
import type { CompositionSpec } from "../composition";
import type { Catalog } from "../catalog";
import type { ValidationIssue } from "./types";

/** An internal id outside the allowlist and a catalog id the discovery file does not know are both refusals. */
export function validateCatalog(spec: CompositionSpec, catalog: Catalog, candidateIds?: readonly string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const scene of spec.scenes) {
    for (const instance of scene.modules) {
      if (instance.kind === "internal") {
        if (!isInternalModuleId(instance.id)) {
          issues.push({ code: "internal_module_unknown", message: `Unknown internal module ${instance.id}.`, sceneId: scene.id, moduleId: instance.id });
        }
        continue;
      }
      if (!catalogItemExists(catalog, instance.id)) {
        issues.push({ code: "catalog_item_unknown", message: `The catalog has no item named ${instance.id}.`, sceneId: scene.id, moduleId: instance.id });
        continue;
      }
      if (candidateIds !== undefined && !candidateIds.includes(instance.id)) {
        issues.push({
          code: "catalog_item_not_candidate",
          message: `The catalog item ${instance.id} was not offered to the planner.`,
          sceneId: scene.id,
          moduleId: instance.id,
        });
      }
    }
  }
  return issues;
}
