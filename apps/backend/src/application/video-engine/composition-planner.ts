import type { AIService } from "../../domain/ai-service/contracts";
import type { AIResultMetadata } from "../../domain/ai-service/types";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { Catalog } from "../../domain/video-engine/catalog";
import { compositionSpecFromWire, compositionSpecWireSchema, type CompositionFormat, type CompositionSpec } from "../../domain/video-engine/composition";
import { designPackTokenSummary } from "../../domain/video-engine/design-pack";
import { PlanningError } from "../../domain/video-engine/errors";
import type { VideoRecipe } from "../../domain/video-engine/recipes/types";
import { validateComposition } from "../../domain/video-engine/validators";
import { report, type ValidationBrief, type ValidationInput, type ValidationIssue } from "../../domain/video-engine/validators/types";
import { validateStoryboard } from "../../domain/video-engine/validators/storyboard-validator";
import type { GeneratedBy } from "../../domain/video/types";
import type { LoadedDesignPack } from "../../infrastructure/video-engine/fs-design-pack-source";
import { COMPOSITION_SPEC_SCHEMA_NAME, VIDEO_ENGINE_AI_SCHEMA_VERSION } from "./ai-schemas";
import type { CatalogCandidate } from "./candidate-selector";
import { COMPOSITION_PLANNER_PROMPT_VERSION, compositionPlannerInstructions } from "./prompts";
import { processTrace } from "./process-trace";

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
  issues: readonly ValidationIssue[];
  generatedBy: GeneratedBy;
  ai: AIResultMetadata;
};

/** Plans one composition and rejects any model plan that fails the compiler's validators. */
export async function runCompositionPlanner(
  command: CompositionPlannerCommand,
  dependencies: CompositionPlannerDependencies,
): Promise<CompositionPlanResult> {
  let feedback = "";
  for (let attempt = 0; ; attempt++) {
    const requestId = dependencies.createRequestId();
    const trace = processTrace({ projectId: command.projectId, requestId, sourceFile: "apps/backend/src/application/video-engine/composition-planner.ts" });
    trace.event("planner_attempt", "started", { attempt: attempt + 1 });
    const result = await trace.run("planner_ai", () => dependencies.ai.generateStructured({
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
      messages: [{ role: "user", content: feedback || "Write the composition spec for this video." }],
      promptVersion: COMPOSITION_PLANNER_PROMPT_VERSION,
      schema: {
        name: COMPOSITION_SPEC_SCHEMA_NAME,
        version: VIDEO_ENGINE_AI_SCHEMA_VERSION,
        schema: compositionSpecWireSchema,
      },
    }));
    trace.response("composition_plan", result.data);

    const { data: _data, ...ai } = result;
    const spec = compositionSpecFromWire(result.data);
    const report = validatePlan({
      spec,
      catalog: dependencies.catalog,
      recipe: command.recipe,
      designPack: command.designPack.manifest,
      brief: command.brief,
      assets: command.assetIds.map((id) => ({ id })),
      candidateIds: command.candidates.map((candidate) => candidate.name),
    });
    trace.event("planner_validation", report.ok ? "completed" : "rejected", {
      attempt: attempt + 1,
      issueCodes: report.issues.map((issue) => issue.code),
    });

    if (!report.ok) {
      if (attempt < 2 && !report.issues.some((issue) => issue.code === "recipe_field_missing")) {
        feedback = [
          "Correct this rejected composition. Return a complete replacement spec, preserving valid scenes.",
          "Follow the confirmed brief and recipe instructions exactly. Do not invent teaser copy.",
          "Previous spec:",
          JSON.stringify(result.data),
          "Validation errors to fix:",
          JSON.stringify(report.issues),
        ].join("\n");
        trace.event("planner_correction", "scheduled", { attempt: attempt + 2 });
        continue;
      }
      const issueCodes = report.issues.map((issue) => issue.code);
      const issueLocations = report.issues.map(({ code, sceneId, moduleId }) =>
        `${code}${sceneId ? ` at ${sceneId}` : ""}${moduleId ? `/${moduleId}` : ""}`,
      );
      throw new PlanningError(
        "composition_plan_invalid",
        `The model composition for ${command.recipe.id} is not valid: ${issueLocations.join(", ")}.`,
        issueCodes,
      );
    }

    return {
      spec,
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
}

function validatePlan(input: ValidationInput) {
  const validation = validateComposition(input);
  if (validation.issues.some((issue) => issue.code === "schema_invalid")) return validation;
  return report([...validation.issues, ...validateStoryboard(input)]);
}
