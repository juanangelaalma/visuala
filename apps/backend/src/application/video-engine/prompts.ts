import { COMPOSITION_SPEC_VERSION, MIN_SCENE_SECONDS } from "../../domain/video-engine/composition";
import { INTERNAL_MODULE_IDS } from "../../domain/video-engine/modules/ids";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { VideoRecipe } from "../../domain/video-engine/recipes/types";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import type { CatalogCandidate } from "./candidate-selector";

export const ART_DIRECTOR_PROMPT_VERSION = "art_director@v1";
export const COMPOSITION_PLANNER_PROMPT_VERSION = "composition_planner@v1";

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
    "Scene durationFrames must add up to exactly that total. Scenes play back to back in the order given, one per art-direction beat, in the same order.",
    `schemaVersion is "${COMPOSITION_SPEC_VERSION}". style is the design pack's id and version.`,
    `On-screen language: ${languageName(input.language)}`,
    "",
    "Confirmed brief. It is the only source of facts:",
    JSON.stringify(input.brief),
    "",
    "Art direction to realise:",
    JSON.stringify(input.artDirection),
    "",
    "Internal modules. A module is `{ id, kind: \"internal\", content }`; content keys are that module's slots:",
    ...INTERNAL_MODULE_IDS.map((id) => `- ${id}`),
    "",
    "Design tokens you may rely on (reach them through module slots, never as free text):",
    input.designPackTokens,
    "",
    input.candidates.length === 0
      ? "No catalog block matched this brief. Use internal modules only and name no catalog item."
      : [
          "Catalog blocks you may name, and nothing else. A block is `{ id, kind: \"catalog\", content }`; content keys are its variables:",
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
    `- Every scene is at least ${shortestScene} frames and at most ${totalFrames} frames.`,
    "- Every content value is either text that already appears in the brief, an asset id from the list, or a ground tone. Never invent a price, discount, address, phone number, or claim.",
    "- A catalog block may only sit in a scene at least as long as its own duration.",
    "- Keep a Headline and a CTA module in the composition so it always reads without the catalog.",
    "- Return the JSON object only.",
  ].join("\n");
}
