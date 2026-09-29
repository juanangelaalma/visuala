import type { DesignPackManifest } from "../design-pack";
import type { RecipeAspectRatio } from "../recipes/types";
import type { InternalModuleId } from "./ids";

/** Text is copy and must trace to the brief; an asset is an id the render was given; a token is an enumerated value. */
export type ModuleSlotKind = "text" | "asset" | "token";

export type ModuleSlot = {
  name: string;
  required: boolean;
  kind: ModuleSlotKind;
  /** The planner is told this limit; a value past it is refused rather than clipped at render time. */
  maxLength?: number;
};

export type ModuleAsset = { id: string; fileName: string };

export type ModuleBuildInput = {
  designPack: DesignPackManifest;
  aspectRatio: RecipeAspectRatio;
  content: Readonly<Record<string, string>>;
  assets: readonly ModuleAsset[];
};

export type ModuleOutput = { html: string; css: string };

export type VideoModule = {
  id: InternalModuleId;
  version: string;
  supportedRatios: readonly RecipeAspectRatio[];
  slots: readonly ModuleSlot[];
  build(input: ModuleBuildInput): ModuleOutput;
};

export type ModuleErrorCode = "module_slot_invalid" | "module_ratio_unsupported" | "module_asset_missing";

export class ModuleError extends Error {
  constructor(readonly code: ModuleErrorCode, message: string) {
    super(message);
    this.name = "ModuleError";
  }
}
