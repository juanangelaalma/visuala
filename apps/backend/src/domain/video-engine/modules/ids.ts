/** The internal module allowlist. Recipes may only recommend these; anything else is a planner mistake. */
export const INTERNAL_MODULE_IDS = [
  "ProductHero",
  "Headline",
  "SupportingCopy",
  "OfferBadge",
  "Price",
  "BrandMark",
  "CTA",
  "BackgroundTexture",
] as const;

export type InternalModuleId = (typeof INTERNAL_MODULE_IDS)[number];

export function isInternalModuleId(value: string): value is InternalModuleId {
  return (INTERNAL_MODULE_IDS as readonly string[]).includes(value);
}
