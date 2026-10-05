import { COMPOSITION_SPEC_VERSION, MIN_SCENE_SECONDS, SCENE_MOTIONS, SCENE_TRANSITIONS, type CompositionSpec } from "../../domain/video-engine/composition";
import { INTERNAL_MODULES } from "../../domain/video-engine/modules/registry";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { DesignPackManifest } from "../../domain/video-engine/design-pack";
import type { VideoRecipe } from "../../domain/video-engine/recipes/types";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import type { CatalogCandidate } from "./candidate-selector";

export const ART_DIRECTOR_PROMPT_VERSION = "art_director@v1";
export const COMPOSITION_PLANNER_PROMPT_VERSION = "composition_planner@v3";
export const COMPOSITION_AUTHOR_PROMPT_VERSION = "composition_author@v2";

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  id: "Bahasa Indonesia",
  en: "English",
};

function languageName(language: string): string {
  return LANGUAGE_NAMES[language] ?? language;
}

/** The Art Director returns direction in words, never markup and never a commercial fact the brief does not carry. */
export function artDirectorInstructions(input: {
  recipe: VideoRecipe;
  brief: ValidationBrief;
  frameMd: string;
  designMd: string | null;
  assets: readonly { id: string; fileName: string }[];
  language: string;
  durationSeconds: number;
  aspectRatio: string;
}): string {
  const { recipe, brief } = input;
  return [
    "You are the art director for short vertical promo videos made for small food and drink businesses.",
    "You decide how one video should look and read. You do not write code and you do not write the final copy.",
    "",
    `Video type: ${recipe.id}`,
    `Purpose: ${recipe.purpose}`,
    `Length: exactly ${input.durationSeconds} seconds, ${input.aspectRatio}`,
    `On-screen language: ${languageName(input.language)}`,
    "",
    "The storyboard beats this recipe requires, in order. Return every one of them exactly once, with the same ids:",
    ...recipe.beats.map((beat) => `- ${beat.id}: ${beat.intent}`),
    "",
    "Recipe constraints you must respect:",
    ...recipe.constraints.map((constraint) => `- ${constraint}`),
    "",
    "The confirmed brief. It is the only source of facts:",
    JSON.stringify(brief),
    "",
    `Product images available: ${input.assets.length === 0 ? "none" : input.assets.map((asset) => `${asset.id} (${asset.fileName})`).join(", ")}`,
    "",
    "The visual language of this video. Follow it for mood, colour, type, and motion:",
    "---",
    input.frameMd,
    "---",
    ...(input.designMd ? ["Additional style direction in design.md:", input.designMd, ""] : []),
    "",
    "Rules:",
    "- Every price, discount, percentage, phone number, address, benefit, and call to action must come from the brief. Never invent one, never round one, never make one more exciting. If the brief has no discount, do not imply one.",
    "- mainMessage must be assembled only from words and numbers already in the brief.",
    "- hierarchy lists what the viewer should read first, in order, using the brief's own content.",
    "- Direction is in words: no HTML, CSS, JavaScript, no file names, no timings in frames.",
    "- Name only the image ids listed above, and only if you actually use them.",
    "- emphasis is high, medium, or low per beat; at most two beats may be high.",
  ].join("\n");
}

/** The planner writes the spec, so it gets the exact shape, the frame math, and only the candidate ids it may name. */
export function compositionPlannerInstructions(input: {
  recipe: VideoRecipe;
  brief: ValidationBrief;
  artDirection: ArtDirection;
  designPackTokens: string;
  candidates: readonly CatalogCandidate[];
  assetIds: readonly string[];
  language: string;
  fps: number;
  durationSeconds: number;
  aspectRatio: string;
}): string {
  const totalFrames = input.durationSeconds * input.fps;
  const shortestScene = Math.round(MIN_SCENE_SECONDS * input.fps);

  return [
    "You are the planner for a modular video composition engine. Return one composition spec.",
    "",
    `Format: aspectRatio ${input.aspectRatio}, fps ${input.fps}, durationSeconds ${input.durationSeconds} (${totalFrames} frames total).`,
    "Scene durationFrames must add up to exactly that total. Make exactly one scene per recipe beat below, with that beat's exact id, in the same order. Each scene has one purpose and one focal element.",
    `schemaVersion is "${COMPOSITION_SPEC_VERSION}". style is the design pack's id and version.`,
    `On-screen language: ${languageName(input.language)}`,
    "",
    "Recipe storyboard to realise:",
    ...input.recipe.beats.map((beat) => `- ${beat.id}: ${beat.intent}`),
    ...(input.recipe.id === "discount_promo" ? [
      "The discount story is product_reveal → offer_reveal → cta. The product scene gives ProductHero the focus, with its name as a caption; no OfferBadge, Price or CTA. The offer scene uses one OfferBadge for the exact confirmed label, with optional distinct offer detail. The closing scene gives one CTA the focus.",
    ] : []),
    ...(input.recipe.id === "product_launch" ? [
      "For product_launch, tease contains only the confirmed product or brand name as text and must not use ProductHero. Reveal uses ProductHero with a listed asset and the confirmed product name; do not add the CTA or keyMessage there. Message shows the exact keyMessage in one Headline or SupportingCopy module. CTA uses one CTA module with the exact confirmed callToAction; do not add other claims.",
    ] : []),
    "For other recipes, realise their own beat purposes: product beats show the product/name, message or highlight beats show the keyMessage, menu shows the named menu items, tease withholds the product image, and cta/visit closes on the confirmed action/destination.",
    "The confirmed keyMessage may remain as subordinate SupportingCopy on a product or closing scene when the art direction calls for it, but never as a competing Headline. Do not repeat text already visible in another module in that scene.",
    "",
    "Confirmed brief. It is the only source of facts:",
    JSON.stringify(input.brief),
    "",
    "Art direction to realise:",
    JSON.stringify(input.artDirection),
    "",
    "Internal modules. A module is `{ id, kind: \"internal\", content }`, where content is a list of `{ key, value }` pairs. Use these ids and slot keys exactly, case-sensitive:",
    ...INTERNAL_MODULES.map((module) =>
      `- ${module.id}: ${
        module.slots.length === 0
          ? "no slots"
          : module.slots.map((slot) => `${slot.name} (${slot.kind}${slot.required ? ", required" : ", optional"}${slot.maxLength === undefined ? "" : `, max ${slot.maxLength}`})`).join(", ")
      }`,
    ),
    "",
    "Design tokens you may rely on (reach them through module slots, never as free text):",
    input.designPackTokens,
    "",
    input.candidates.length === 0
      ? "No catalog block matched this brief. Use internal modules only and name no catalog item."
      : [
          "Catalog blocks you may name, and nothing else. A block is `{ id, kind: \"catalog\", content }`, where content is a list of `{ key, value }` pairs and each key is one of its variables:",
          ...input.candidates.map(
            (candidate) =>
              `- ${candidate.name} (${candidate.dimensions?.width}x${candidate.dimensions?.height}, ${candidate.duration}s, beats: ${candidate.beats.join("/")}) variables: ${
                candidate.variables.length === 0
                  ? "none declared"
                  : candidate.variables.map((variable) => `${variable.id}${variable.type ? `:${variable.type}` : ""}`).join(", ")
              }`,
          ),
          "Any catalog id outside this list is a hard failure.",
        ].join("\n"),
    "",
    `Asset ids you may use: ${input.assetIds.length === 0 ? "none" : input.assetIds.join(", ")}.`,
    "",
    "Rules:",
    "- Scene ids are unique snake_case, and each scene has at least one module; the first module is behind, the last in front.",
    "- Module ids and slot keys are case-sensitive: copy them from the lists above exactly, never lowercase or rename them.",
    "- `content` is always a list of `{ key, value }` pairs, and `[]` when a module has no values.",
    `- Every scene must include transition (${SCENE_TRANSITIONS.join(", ")}) and motion (${SCENE_MOTIONS.join(", ")}). No free-form motion names.`,
    "- transition describes the incoming handoff to this scene; use slide by default. cut is a hard cut, zoom is a directional zoom, fade is a directional handoff with an early fade, not a long dissolve.",
    "- Use staged_reveal by default to reveal the focal content in reading order. Use product_push only on a product beat containing ProductHero.",
    "- Reserve CTA for the final closing scene. Never repeat its action in opening or offer beats.",
    "- Never repeat visible text within a scene, even with different case, punctuation, or a longer phrase around it. BrandMark and Headline must not repeat the product name; OfferBadge and Headline must not repeat the offer.",
    `- Every scene is at least ${shortestScene} frames and at most ${totalFrames} frames.`,
    "- Every content value is either text that already appears in the brief, an asset id from the list, or a ground tone. Never invent a price, discount, address, phone number, or claim.",
    ...(input.assetIds.length === 0 ? [] : ["- At least one scene must use ProductHero with an assetId copied exactly from the asset list."]),
    "- A catalog block may only sit in a scene at least as long as its own duration.",
    "- Every beat must remain understandable from its internal focal module; a catalog block can support it but cannot replace it.",
    "- Return the JSON object only.",
  ].join("\n");
}

/** The model owns the whole document and every animation; the spec supplies timing and verified facts, not markup. */
export function compositionAuthorInstructions(input: {
  brief: ValidationBrief;
  artDirection: ArtDirection;
  spec: CompositionSpec;
  frameMd: string;
  designMd: string | null;
  manifest: DesignPackManifest;
  assets: readonly { id: string; fileName: string }[];
  blocks: readonly { name: string; entryPath: string }[];
  width: number;
  height: number;
  language: string;
}): string {
  return [
    "You are writing the complete HyperFrames composition for a finished video. Return ONLY a complete index.html document, from <!doctype html> to </html>. No Markdown, no code fence, no separate files.",
    "You own all HTML, CSS, JavaScript, visual composition, and GSAP choreography. No renderer will add scenes, styles, hosts, or animations to your document.",
    `Canvas: ${input.width}x${input.height}px; ${input.spec.format.fps} fps; exactly ${input.spec.format.durationSeconds} seconds. On-screen language: ${languageName(input.language)}.`,
    "The approved brief is the ONLY source of commercial facts, text, numbers, prices and calls to action:",
    JSON.stringify(input.brief),
    "Art direction:",
    JSON.stringify(input.artDirection),
    "Storyboard and frame-accurate scene lengths:",
    JSON.stringify(input.spec),
    "The scene motion and transition labels in the storyboard are planning metadata, NOT a menu of permitted animations. Compose an original, purposeful motion language for this video. Each beat must remain recognizable and readable.",
    "Scene and GSAP safety requirements:",
    "- Treat .clip and .hf-scene as static structural containers. NEVER target them in gsap.set/from/to/fromTo or any tween/timeline operation; animate only descendants such as .hf-scene__content or .hf-module. Do not use CSS animations or transitions for scene visibility either.",
    "- Use explicit GSAP initial states and absolute timeline positions so every frame is correct when sought directly. Do not hide all scene content at the same time or rely on a previous frame to initialize visibility.",
    "- Protect every scene boundary: at the boundary frame and the following frame, at least one real foreground text or image must be painted and visible. Do not count a background, an aria-hidden ornament, or an element whose entrance tween still has opacity 0. Show the incoming scene content at its exact data-start; keep the outgoing foreground visible until the incoming scene has visible foreground, without a blank frame.",
    "- Give each scene a foreground text or image that is visible at its start, independently of later entrance choreography. Never schedule outgoing content to disappear at the same instant the incoming foreground starts fading in.",
    "Text fit requirements:",
    `- Fit every rendered text line inside its .hf-module box and inside the ${input.width}x${input.height} canvas with a visible safe margin. Account for the actual local font, uppercase glyph widths, font size, weight, and letter spacing; wrap lines or reduce type size when needed. Do not use oversized fixed typography that exceeds its box.`,
    "- Check the longest line in each text module, especially CTA headlines. A text rectangle must remain within both its module and the canvas; visual importance does not excuse overflow or clipping.",
    "Style direction in frame.md:",
    input.frameMd,
    ...(input.designMd ? ["Additional style direction in design.md:", input.designMd] : []),
    "Available design tokens, fonts and motion guidance in manifest.json:",
    JSON.stringify(input.manifest),
    `Available product images: ${input.assets.length ? input.assets.map((asset) => `${asset.id} = assets/${asset.fileName}`).join("; ") : "none"}. Never invent an image or asset path.`,
    `Installed HyperFrames sub-compositions: ${input.blocks.length ? input.blocks.map((block) => `${block.name} = ${block.entryPath}`).join("; ") : "none"}. Use one only when it improves a beat; place its host yourself with data-composition-id, data-composition-src, data-start, data-duration and data-track-index.`,
    "HyperFrames contract:",
    `- Put one visible root element data-composition-id="main" with data-fps="${input.spec.format.fps}", data-duration="${input.spec.format.durationSeconds}", data-width="${input.width}" and data-height="${input.height}". Give it the exact pixel canvas size.`,
    "- Represent each storyboard beat as one .clip.hf-scene with data-track-index=\"0\", its exact data-scene id, and absolute data-start and data-duration in seconds. Calculate these from cumulative durationFrames/fps and durationFrames/fps; retain at least four decimal places for fractional seconds. Inside each put a direct child .hf-scene__content and wrap meaningful text/images in .hf-module elements for visual checks. You choose every element and layout; these class names are instrumentation, not a template.",
    '- Load <script src="vendor/gsap.min.js"></script> before your own inline script. Create a paused GSAP timeline covering the whole video, register it as window.__timelines["main"]. Use explicit initial states and seek-safe absolute timeline positions; do not rely on CSS animations, wall-clock timers, user input or autoplay.',
    "- Provide complete inline CSS including local @font-face references to fonts/<file> from the manifest. Do not depend on remote URLs, CDNs or files beyond the listed assets, fonts, GSAP and installed blocks.",
    "- Keep the root visible at each scene boundary and important content readable before each beat ends. Do not invent claims, testimonials, decorative fake metrics, or interactive controls for this rendered video.",
    "- Write production HTML, CSS and JS directly, not pseudocode or placeholder code. Keep the output compact enough to finish completely.",
  ].join("\n\n");
}
