import { productSpotlight } from "./product-spotlight";
import { offerBoard } from "./offer-board";
import { editorialSplit } from "./editorial-split";
import { galleryReveal } from "./gallery-reveal";
import { kineticType } from "./kinetic-type";
import { artisanDetail } from "./artisan-detail";
import { menuSequence } from "./menu-sequence";
import { offerTakeover } from "./offer-takeover";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { VideoAspectRatio, VideoStyleId, VideoType } from "../types";

export type TemplateInput = { manifest: RenderManifest; stylePack: StylePack };

export type RenderTemplate = {
  id: string;
  version: string;
  supports: readonly VideoType[];
  aspectRatios: readonly VideoAspectRatio[];
  build(input: TemplateInput): { html: string; css: string };
};

/** The allowlist. The model may recommend a video's look; it never chooses a template. */
export const RENDER_TEMPLATES: readonly RenderTemplate[] = Object.freeze([
  productSpotlight,
  offerBoard,
  editorialSplit,
  galleryReveal,
  kineticType,
  artisanDetail,
  menuSequence,
  offerTakeover,
]);

/** The intake's choice, made once, when the job is queued and frozen into its snapshot. */
const TEMPLATE_SELECTION: Record<VideoType, Record<VideoStyleId, string>> = {
  product_promo: { bold_pop: "product-spotlight", clean_product: "editorial-split", warm_artisan: "artisan-detail", premium_dark: "gallery-reveal" },
  product_launch: { bold_pop: "kinetic-type", clean_product: "editorial-split", warm_artisan: "artisan-detail", premium_dark: "gallery-reveal" },
  discount_promo: { bold_pop: "offer-takeover", clean_product: "offer-board", warm_artisan: "offer-board", premium_dark: "offer-takeover" },
  menu_showcase: { bold_pop: "menu-sequence", clean_product: "offer-board", warm_artisan: "menu-sequence", premium_dark: "menu-sequence" },
};

export function selectTemplate(input: { videoType: VideoType; aspectRatio: VideoAspectRatio; styleId?: VideoStyleId }): RenderTemplate {
  const templateId = input.styleId && TEMPLATE_SELECTION[input.videoType][input.styleId];
  const template = templateId
    ? RENDER_TEMPLATES.find((candidate) => candidate.id === templateId)
    : RENDER_TEMPLATES.find(
        (candidate) => candidate.supports.includes(input.videoType) && candidate.aspectRatios.includes(input.aspectRatio),
      );
  if (!template || !template.supports.includes(input.videoType) || !template.aspectRatios.includes(input.aspectRatio)) {
    throw new Error(`No template for ${input.videoType} at ${input.aspectRatio}.`);
  }
  return template;
}

/**
 * The render's choice. A queued job names the template it was approved with, so resolution is by that
 * id and not by re-selecting from the video type: adding a template to the registry must never change
 * what a job that is already queued renders.
 */
export function templateById(id: string, version: string): RenderTemplate {
  const template = RENDER_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`No template with id ${id}.`);
  if (template.version !== version) throw new Error(`Template ${id} is at version ${template.version}, not ${version}.`);
  return template;
}
