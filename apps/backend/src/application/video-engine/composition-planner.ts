import type { AIService } from "../../domain/ai-service/contracts";
import type { AIResultMetadata } from "../../domain/ai-service/types";
import { compositionSpecFromWire, compositionSpecWireSchema, type CompositionFormat, type CompositionSpec } from "../../domain/video-engine/composition";
import { designPackTokenSummary } from "../../domain/video-engine/design-pack";
import { PlanningError } from "../../domain/video-engine/errors";
import { buildFallbackSpec } from "../../domain/video-engine/fallback";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { Catalog } from "../../domain/video-engine/catalog";
import type { VideoRecipe } from "../../domain/video-engine/recipes/types";
import { validateComposition } from "../../domain/video-engine/validators";
import type { ValidationBrief, ValidationIssue } from "../../domain/video-engine/validators/types";
import type { GeneratedBy } from "../../domain/video/types";
import type { LoadedDesignPack } from "../../infrastructure/video-engine/fs-design-pack-source";
import { COMPOSITION_SPEC_SCHEMA_NAME, VIDEO_ENGINE_AI_SCHEMA_VERSION } from "./ai-schemas";
import type { CatalogCandidate } from "./candidate-selector";
import { COMPOSITION_PLANNER_PROMPT_VERSION, compositionPlannerInstructions } from "./prompts";

export type CompositionPlannerDependencies = {
  ai: AIService;
  createRequestId: () => string;
  catalog: Catalog;
};

export type CompositionPlannerCommand = {
  userId: string;
  projectId: string;
  recipe: VideoRecipe;
  brief: ValidationBrief;
  designPack: LoadedDesignPack;
  artDirection: ArtDirection;
  candidates: readonly CatalogCandidate[];
  assetIds: readonly string[];
  language: string;
  format: CompositionFormat;
};

export type CompositionPlanResult = {
  spec: CompositionSpec;
  /** True when the model's plan was rejected and the deterministic fallback is what will be rendered. */
  isFallback: boolean;
  /** Why a plan was rejected. Empty on a first-try success, and the reason the fallback ran otherwise. */
  issues: readonly ValidationIssue[];
  generatedBy: GeneratedBy | null;
  ai: AIResultMetadata | null;
};

/** Plans one composition and gates it with the compiler's validators. A failed plan is replaced by the fallback, never retried, and the reasons come back with it. */
export async function runCompositionPlanner(
  command: CompositionPlannerCommand,
  dependencies: CompositionPlannerDependencies,
): Promise<CompositionPlanResult> {
  const requestId = dependencies.createRequestId();

  const result = await dependencies.ai.generateStructured({
    requestId,
    task: "composition_planner",
    context: { userId: command.userId, projectId: command.projectId },
    instructions: compositionPlannerInstructions({
      recipe: command.recipe,
      brief: command.brief,
      artDirection: command.artDirection,
      designPackTokens: designPackTokenSummary(command.designPack.manifest),
      candidates: command.candidates,
      assetIds: command.assetIds,
      language: command.language,
      fps: command.format.fps,
      durationSeconds: command.format.durationSeconds,
      aspectRatio: command.format.aspectRatio,
    }),
    messages: [{ role: "user", content: "Write the composition spec for this video." }],
    promptVersion: COMPOSITION_PLANNER_PROMPT_VERSION,
    schema: {
      name: COMPOSITION_SPEC_SCHEMA_NAME,
      version: VIDEO_ENGINE_AI_SCHEMA_VERSION,
      schema: compositionSpecWireSchema,
    },
  });

  const { data: _data, ...ai } = result;
  const spec = compositionSpecFromWire(result.data);
  const report = validateComposition({
    spec,
    catalog: dependencies.catalog,
    recipe: command.recipe,
    designPack: command.designPack.manifest,
    brief: command.brief,
    assets: command.assetIds.map((id) => ({ id })),
    candidateIds: command.candidates.map((candidate) => candidate.name),
  });

  if (report.ok) {
    return {
      spec,
      isFallback: false,
      issues: [],
      generatedBy: {
        profileId: result.profileId,
        provider: result.provider,
        model: result.model,
        promptVersion: COMPOSITION_PLANNER_PROMPT_VERSION,
        requestId,
      },
      ai,
    };
  }

  return fallback(command, report.issues, ai);
}

function fallback(command: CompositionPlannerCommand, issues: readonly ValidationIssue[], ai: AIResultMetadata): CompositionPlanResult {
  const spec = buildFallbackSpec({
    designPack: command.designPack.manifest,
    format: command.format,
    brief: command.brief,
    assets: command.assetIds.map((id) => ({ id })),
  });

  return { spec, isFallback: true, issues, generatedBy: null, ai };
}

/** The fallback is deterministic and must itself pass the gate; if it does not, the brief is unusable. */
export function assertFallbackValid(
  plan: CompositionPlanResult,
  command: CompositionPlannerCommand,
  catalog: Catalog,
): CompositionPlanResult {
  if (!plan.isFallback) return plan;

  const report = validateComposition({
    spec: plan.spec,
    catalog,
    recipe: command.recipe,
    designPack: command.designPack.manifest,
    brief: command.brief,
    assets: command.assetIds.map((id) => ({ id })),
  });

  if (!report.ok) {
    throw new PlanningError("fallback_invalid", `The fallback composition for ${command.recipe.id} is not valid: ${report.issues.map((issue) => issue.code).join(", ")}.`);
  }
  return plan;
}
