import type { AIService } from "../../domain/ai-service/contracts";
import type { AIResultMetadata } from "../../domain/ai-service/types";
import { artDirectionBeatIssues, artDirectionSchema, type ArtDirection } from "../../domain/video-engine/art-direction";
import { PlanningError } from "../../domain/video-engine/errors";
import { briefValues, residual } from "../../domain/video-engine/facts";
import type { LoadedDesignPack } from "../../infrastructure/video-engine/fs-design-pack-source";
import type { VideoRecipe } from "../../domain/video-engine/recipes/types";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import type { GeneratedBy } from "../../domain/video/types";
import { ART_DIRECTION_SCHEMA_NAME, VIDEO_ENGINE_AI_SCHEMA_VERSION } from "./ai-schemas";
import { ART_DIRECTOR_PROMPT_VERSION, artDirectorInstructions } from "./prompts";

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

  const result = await dependencies.ai.generateStructured({
    requestId,
    task: "art_director",
    context: { userId: command.userId, projectId: command.projectId },
    instructions: artDirectorInstructions({
      recipe: command.recipe,
      brief: command.brief,
      frameMd: command.designPack.frameMd,
      assets: command.assets,
      language: command.language,
      durationSeconds: command.durationSeconds,
      aspectRatio: command.aspectRatio,
    }),
    messages: [],
    promptVersion: ART_DIRECTOR_PROMPT_VERSION,
    schema: {
      name: ART_DIRECTION_SCHEMA_NAME,
      version: VIDEO_ENGINE_AI_SCHEMA_VERSION,
      schema: artDirectionSchema,
    },
  });

  const artDirection = result.data;
  const { data: _data, ...ai } = result;

  const beatIssues = artDirectionBeatIssues(artDirection, command.recipe);
  if (beatIssues.length > 0) {
    throw new PlanningError("art_direction_beat_mismatch", `The art direction does not match the ${command.recipe.id} recipe beats: ${beatIssues.join("; ")}.`);
  }

  const leftover = residual(artDirection.mainMessage, briefValues(command.brief));
  if (leftover.length > 0) {
    throw new PlanningError("art_direction_untraceable", `The art direction main message contains text the brief does not support: "${leftover}".`);
  }

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
