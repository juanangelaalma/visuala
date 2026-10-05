import type { AIService } from "../../domain/ai-service/contracts";
import type { AIResultMetadata } from "../../domain/ai-service/types";
import { artDirectionBeatIssues, artDirectionSchema, type ArtDirection } from "../../domain/video-engine/art-direction";
import { PlanningError } from "../../domain/video-engine/errors";
import { briefValues } from "../../domain/video-engine/facts";
import type { LoadedDesignPack } from "../../infrastructure/video-engine/fs-design-pack-source";
import type { VideoRecipe } from "../../domain/video-engine/recipes/types";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import type { GeneratedBy } from "../../domain/video/types";
import { ART_DIRECTION_SCHEMA_NAME, VIDEO_ENGINE_AI_SCHEMA_VERSION } from "./ai-schemas";
import { ART_DIRECTOR_PROMPT_VERSION, artDirectorInstructions } from "./prompts";
import { processTrace } from "./process-trace";

export type ArtDirectorDependencies = {
  ai: AIService;
  createRequestId: () => string;
};

export type ArtDirectorCommand = {
  userId: string;
  projectId: string;
  recipe: VideoRecipe;
  brief: ValidationBrief;
  designPack: LoadedDesignPack;
  assets: readonly { id: string; fileName: string; mimeType: string }[];
  language: string;
  durationSeconds: number;
  aspectRatio: string;
};

export type ArtDirectorResult = {
  artDirection: ArtDirection;
  generatedBy: GeneratedBy;
  /** Latency, tokens, and cost, so the caller can record what this plan cost (PRD observability). */
  ai: AIResultMetadata;
};

/** Runs one art-direction turn and gates it: the recipe owns the beats, and an unsupported main message is refused here, not rendered. */
export async function runArtDirector(
  command: ArtDirectorCommand,
  dependencies: ArtDirectorDependencies,
): Promise<ArtDirectorResult> {
  const requestId = dependencies.createRequestId();

  const trace = processTrace({ projectId: command.projectId, requestId, sourceFile: "apps/backend/src/application/video-engine/art-director.ts" });
  const result = await trace.run("art_director_ai", () => dependencies.ai.generateStructured({
    requestId,
    task: "art_director",
    context: { userId: command.userId, projectId: command.projectId },
    instructions: artDirectorInstructions({
      recipe: command.recipe,
      brief: command.brief,
      frameMd: command.designPack.frameMd,
      designMd: command.designPack.designMd,
      assets: command.assets,
      language: command.language,
      durationSeconds: command.durationSeconds,
      aspectRatio: command.aspectRatio,
    }),
    messages: [{ role: "user", content: "Give the art direction for this video." }],
    promptVersion: ART_DIRECTOR_PROMPT_VERSION,
    schema: {
      name: ART_DIRECTION_SCHEMA_NAME,
      version: VIDEO_ENGINE_AI_SCHEMA_VERSION,
      schema: artDirectionSchema,
    },
  }));
  trace.response("art_direction", result.data);

  const artDirection = result.data;
  const { data: _data, ...ai } = result;

  const beatIssues = artDirectionBeatIssues(artDirection, command.recipe);
  if (beatIssues.length > 0) {
    throw new PlanningError("art_direction_beat_mismatch", `The art direction does not match the ${command.recipe.id} recipe beats: ${beatIssues.join("; ")}.`);
  }

  const allowedWords = new Set(briefValues(command.brief).flatMap(words));
  const unsupportedWords = words(artDirection.mainMessage).filter((word) => !allowedWords.has(word));
  if (unsupportedWords.length > 0) {
    throw new PlanningError("art_direction_untraceable", `The art direction main message contains words the brief does not support: "${unsupportedWords.join(" ")}".`);
  }
  trace.event("art_direction_validation", "completed");

  return {
    artDirection,
    generatedBy: {
      profileId: result.profileId,
      provider: result.provider,
      model: result.model,
      promptVersion: ART_DIRECTOR_PROMPT_VERSION,
      requestId,
    },
    ai,
  };
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
