import { backgroundTexture } from "./background-texture";
import { brandMark } from "./brand-mark";
import { cta } from "./cta";
import { headline } from "./headline";
import { offerBadge } from "./offer-badge";
import { price } from "./price";
import { productHero } from "./product-hero";
import { supportingCopy } from "./supporting-copy";
import { INTERNAL_MODULE_IDS } from "./ids";
import type { InternalModuleId } from "./ids";
import type { VideoModule } from "./types";

/** The internal module allowlist, materialised. A recipe may only recommend names found here. */
export const INTERNAL_MODULES: readonly VideoModule[] = Object.freeze([
  productHero,
  headline,
  supportingCopy,
  offerBadge,
  price,
  brandMark,
  cta,
  backgroundTexture,
]);

export function internalModuleById(id: InternalModuleId): VideoModule {
  const module = INTERNAL_MODULES.find((candidate) => candidate.id === id);
  if (!module) throw new Error(`No internal module with id ${id}.`);
  return module;
}

export function moduleVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const module of INTERNAL_MODULES) versions[module.id] = module.version;
  return versions;
}

export { INTERNAL_MODULE_IDS };
export type { InternalModuleId } from "./ids";
export type { ModuleBuildInput, ModuleAsset, ModuleOutput, ModuleSlot, VideoModule } from "./types";
