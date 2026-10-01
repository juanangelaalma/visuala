import { COMPOSITION_SPEC_VERSION } from "./composition";
import type { CompositionFormat, CompositionModuleInstance, CompositionSpec } from "./composition";
import type { DesignPackManifest } from "./design-pack";
import { normalize } from "./facts";
import type { RecipeBeat, VideoRecipe } from "./recipes/types";
import { beatPurpose, closingCopy } from "./storyboard";
import type { ValidationBrief } from "./validators/types";

export type FallbackInput = {
  designPack: DesignPackManifest;
  format: CompositionFormat;
  recipe: VideoRecipe;
  brief: ValidationBrief;
  assets: readonly { id: string }[];
};

/** Internal modules and confirmed brief values, following the recipe's own ordered beats. */
export function buildFallbackSpec(input: FallbackInput): CompositionSpec {
  const total = input.format.durationSeconds * input.format.fps;
  const count = input.recipe.beats.length;
  const baseFrames = Math.floor(total / count);
  const scenes = input.recipe.beats.map((beat, index) => {
    const modules = fallbackModules(input, beat);
    return {
      id: beat.id,
      durationFrames: baseFrames + (index < total % count ? 1 : 0),
      transition: "slide" as const,
      motion: modules.some((module) => module.id === "ProductHero") ? "product_push" as const : "staged_reveal" as const,
      modules,
    };
  });

  return {
    schemaVersion: COMPOSITION_SPEC_VERSION,
    format: input.format,
    style: { id: input.designPack.styleId, version: input.designPack.version },
    scenes,
  };
}

function fallbackModules(input: FallbackInput, beat: RecipeBeat): CompositionModuleInstance[] {
  const purpose = beatPurpose(beat);
  const background: CompositionModuleInstance = {
    id: "BackgroundTexture", kind: "internal", content: { tone: purpose === "closing" ? "green" : purpose === "offer" ? "cream2" : "cream" },
  };
  const { brief } = input;

  switch (purpose) {
    case "product":
      return input.assets[0]
        ? [background, { id: "ProductHero", kind: "internal", content: { assetId: input.assets[0].id } }, { id: "Headline", kind: "internal", content: { text: brief.productName } }]
        : [background, { id: "BrandMark", kind: "internal", content: { text: brief.productName } }];
    case "tease":
      return [background, { id: "BrandMark", kind: "internal", content: { text: brief.brandName ?? brief.productName } }];
    case "message":
      return [background, { id: "Headline", kind: "internal", content: { text: brief.keyMessage } }];
    case "offer":
      return [background, { id: "OfferBadge", kind: "internal", content: { text: brief.offer?.label ?? brief.keyMessage } }];
    case "closing": {
      const action = closingCopy(brief, beat);
      const message = normalize(brief.keyMessage).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const repeated = [action, brief.productName, brief.brandName, brief.orderDestination]
        .filter((value): value is string => Boolean(value))
        .map((value) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim())
        .some((value) => ` ${value} `.includes(` ${message} `) || ` ${message} `.includes(` ${value} `));
      return [
        background,
        { id: "CTA", kind: "internal", content: { text: action } },
        ...(message && !repeated ? [{ id: "SupportingCopy", kind: "internal" as const, content: { text: brief.keyMessage } }] : []),
      ];
    }
    case "menu":
      return [background, { id: "SupportingCopy", kind: "internal", content: { text: (brief.menuItems ?? []).map((item) => [item.name, item.price].filter(Boolean).join(" ")).join("\n") } }];
  }
}
