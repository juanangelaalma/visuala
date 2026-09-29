import { ModuleError } from "./types";
import type { InternalModuleId } from "./ids";
import type { ModuleAsset, ModuleSlot } from "./types";

/** Resolves a module's content, refusing a missing required slot or an over-long value. */
export function readSlots(moduleId: InternalModuleId, slots: readonly ModuleSlot[], content: Readonly<Record<string, string>>): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const slot of slots) {
    const value = content[slot.name]?.trim();
    if (value === undefined || value.length === 0) {
      if (slot.required) throw invalid(moduleId, `Module ${moduleId} needs the ${slot.name} slot.`);
      continue;
    }
    if (slot.maxLength !== undefined && value.length > slot.maxLength) {
      throw invalid(moduleId, `The ${slot.name} slot of ${moduleId} exceeds ${slot.maxLength} characters.`);
    }
    resolved[slot.name] = value;
  }
  return resolved;
}

export function assertRatioSupported(moduleId: InternalModuleId, supported: readonly string[], aspectRatio: string): void {
  if (!supported.includes(aspectRatio)) {
    throw new ModuleError("module_ratio_unsupported", `Module ${moduleId} does not support ${aspectRatio}.`);
  }
}

export function requireAsset(moduleId: InternalModuleId, assets: readonly ModuleAsset[], assetId: string): ModuleAsset {
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new ModuleError("module_asset_missing", `Module ${moduleId} needs asset ${assetId}, which this render was not given.`);
  return asset;
}

/** Every module's markup is addressed by this class, so two instances in one page cannot collide. */
export function moduleClass(id: InternalModuleId): string {
  return `hf-${id}`;
}

function invalid(moduleId: InternalModuleId, message: string): ModuleError {
  return new ModuleError("module_slot_invalid", `[${moduleId}] ${message}`);
}
