import { ASPECT_RATIO_VALUES, catalogItemAspectRatio } from "../catalog";
import { internalModuleById } from "../modules/registry";
import { isInternalModuleId } from "../modules/ids";
import { framesToSeconds } from "../composition";
import type { CompositionSpec } from "../composition";
import type { Catalog, CatalogItem } from "../catalog";
import type { ValidationIssue } from "./types";

const RATIO_TOLERANCE = 0.02;
/** A block may be a little longer than its slot; more than this and it would be cut mid-move. */
const DURATION_TOLERANCE_SECONDS = 0.25;

/** Internal modules declare their ratios; catalog blocks declare the pixel frame they were drawn at, so a mismatch is caught before the render. */
export function validateCompatibility(spec: CompositionSpec, catalog: Catalog): ValidationIssue[] {
  const target = ASPECT_RATIO_VALUES[spec.format.aspectRatio];
  const issues: ValidationIssue[] = [];

  for (const scene of spec.scenes) {
    const sceneSeconds = framesToSeconds(scene.durationFrames, spec.format.fps);

    for (const instance of scene.modules) {
      if (instance.kind === "internal") {
        if (isInternalModuleId(instance.id) && !internalModuleById(instance.id).supportedRatios.includes(spec.format.aspectRatio)) {
          issues.push({ code: "ratio_unsupported", message: `${instance.id} does not support ${spec.format.aspectRatio}.`, sceneId: scene.id, moduleId: instance.id });
        }
        continue;
      }

      const item = catalog.items.find((candidate) => candidate.name === instance.id) as CatalogItem | undefined;
      if (!item) continue;

      const ratio = catalogItemAspectRatio(item);
      if (ratio !== null && Math.abs(ratio - target) > RATIO_TOLERANCE) {
        issues.push({
          code: "catalog_ratio_incompatible",
          message: `${item.name} is authored at ${item.dimensions?.width}x${item.dimensions?.height}, not ${spec.format.aspectRatio}.`,
          sceneId: scene.id,
          moduleId: instance.id,
        });
      }
      if (item.duration !== undefined && item.duration > sceneSeconds + DURATION_TOLERANCE_SECONDS) {
        issues.push({
          code: "catalog_duration_exceeded",
          message: `${item.name} runs ${item.duration}s, longer than the ${sceneSeconds}s scene that hosts it.`,
          sceneId: scene.id,
          moduleId: instance.id,
        });
      }
    }
  }

  return issues;
}
