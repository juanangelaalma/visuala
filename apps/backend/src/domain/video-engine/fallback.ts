import { COMPOSITION_SPEC_VERSION } from "./composition";
import type { CompositionFormat, CompositionModuleInstance, CompositionScene, CompositionSpec } from "./composition";
import type { DesignPackManifest } from "./design-pack";
import type { ValidationBrief } from "./validators/types";

/** Three scenes is the smallest composition that still has a reveal, a message, and a close. */
const SCENE_WEIGHTS = [0.34, 0.33, 0.33] as const;

export type FallbackInput = {
  designPack: DesignPackManifest;
  format: CompositionFormat;
  brief: ValidationBrief;
  assets: readonly { id: string }[];
};

/** Last resort: internal modules and brief values only, so it cannot fail on a catalog item, a ratio, or a fact. */
export function buildFallbackSpec(input: FallbackInput): CompositionSpec {
  const { brief, format } = input;
  const surface = (tone: string): CompositionModuleInstance => ({ id: "BackgroundTexture", kind: "internal", content: { tone } });
  const frames = sceneFrames(format);

  const reveal: CompositionModuleInstance[] = [surface("cream")];
  if (input.assets[0]) reveal.push({ id: "ProductHero", kind: "internal", content: { assetId: input.assets[0].id } });
  else reveal.push({ id: "BrandMark", kind: "internal", content: { text: brief.productName } });

  const message: CompositionModuleInstance[] = [surface("cream2"), { id: "Headline", kind: "internal", content: { text: brief.productName } }];
  if (brief.offer) message.push({ id: "OfferBadge", kind: "internal", content: { text: brief.offer.label } });
  else message.push({ id: "SupportingCopy", kind: "internal", content: { text: brief.keyMessage } });

  const close: CompositionModuleInstance[] = [surface("green")];
  close.push({ id: "CTA", kind: "internal", content: { text: brief.callToAction ?? brief.keyMessage } });

  const scenes: CompositionScene[] = [
    { id: "scene_1", durationFrames: frames[0], transition: "cut", modules: reveal },
    { id: "scene_2", durationFrames: frames[1], transition: "fade", modules: message },
    { id: "scene_3", durationFrames: frames[2], transition: "cut", modules: close },
  ];

  return {
    schemaVersion: COMPOSITION_SPEC_VERSION,
    format,
    style: { id: input.designPack.styleId, version: input.designPack.version },
    scenes,
  };
}

function sceneFrames(format: CompositionFormat): [number, number, number] {
  const total = format.durationSeconds * format.fps;
  const first = Math.floor(total * SCENE_WEIGHTS[0]);
  const second = Math.floor(total * SCENE_WEIGHTS[1]);
  return [first, second, total - first - second];
}
