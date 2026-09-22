import { productSpotlight } from "./product-spotlight";
import { offerBoard } from "./offer-board";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { VideoAspectRatio, VideoType } from "../types";

export type TemplateInput = { manifest: RenderManifest; stylePack: StylePack };

export type RenderTemplate = {
  id: string;
  version: string;
  supports: readonly VideoType[];
  aspectRatios: readonly VideoAspectRatio[];
  build(input: TemplateInput): { html: string; css: string };
};

/** The allowlist. The model may recommend a video's look; it never chooses a template. */
export const RENDER_TEMPLATES: readonly RenderTemplate[] = Object.freeze([productSpotlight, offerBoard]);

/** The intake's choice, made once, when the job is queued and frozen into its snapshot. */
export function selectTemplate(input: { videoType: VideoType; aspectRatio: VideoAspectRatio }): RenderTemplate {
  const template = RENDER_TEMPLATES.find(
    (candidate) => candidate.supports.includes(input.videoType) && candidate.aspectRatios.includes(input.aspectRatio),
  );
  if (!template) throw new Error(`No template for ${input.videoType} at ${input.aspectRatio}.`);
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
