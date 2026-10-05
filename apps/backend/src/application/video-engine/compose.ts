import type { AIService } from "../../domain/ai-service/contracts";
import { isBriefDraftComplete, videoBriefSchema } from "../../domain/video/brief";
import { VideoError } from "../../domain/video/errors";
import type { ProjectAssetRepository, VideoBriefRevisionRepository, VideoProjectRepository } from "../../domain/video/contracts";
import { BUILT_IN_DESIGN_PACK } from "../../domain/video-engine/design-pack";
import { COMPILER_VERSION } from "../../domain/video-engine/compiler";
import { COMPOSITION_FPS, COMPOSITION_SPEC_VERSION } from "../../domain/video-engine/composition";
import { recipeById } from "../../domain/video-engine/recipes/registry";
import type { Catalog } from "../../domain/video-engine/catalog";
import type {
  ArtDirectionRevisionRepository,
  CompositionArtifactRepository,
  CompositionEventRepository,
  CompositionRevisionRepository,
} from "../../domain/video-engine/contracts";
import type { ValidationIssue } from "../../domain/video-engine/validators/types";
import type { DesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";
import { runArtDirector } from "./art-director";
import { selectCatalogCandidates } from "./candidate-selector";
import { runCompositionPlanner } from "./composition-planner";
import type { CompileCommand, FrozenArtifact } from "./compile";
import { COMPOSITION_AUTHOR_PROMPT_VERSION } from "./prompts";
import { toValidationBrief } from "./validation-brief";
import { processTrace } from "./process-trace";

export type ComposeDependencies = {
  projects: VideoProjectRepository;
  assets: ProjectAssetRepository;
  briefRevisions: VideoBriefRevisionRepository;
  artDirectionRevisions: ArtDirectionRevisionRepository;
  compositionRevisions: CompositionRevisionRepository;
  artifacts: CompositionArtifactRepository;
  events: CompositionEventRepository;
  ai: AIService;
  designPack: DesignPackSource;
  loadCatalog: () => Promise<Catalog>;
  compile: (command: CompileCommand) => Promise<FrozenArtifact>;
  createId: () => string;
};

export type ComposeCommand = { userId: string; projectId: string };

export type ComposeResult = {
  compositionRevisionId: string;
  artifactId: string;
  compositionHash: string;
  isFallback: boolean;
  validationIssues: readonly ValidationIssue[];
};

/** Freezes the AI-authored composition before saving its revision, so failed HTML never becomes renderable. */
export async function runComposition(command: ComposeCommand, dependencies: ComposeDependencies): Promise<ComposeResult> {
  const trace = processTrace({ projectId: command.projectId, sourceFile: "apps/backend/src/application/video-engine/compose.ts" });
  return trace.run("composition", async () => {
  const project = await trace.run("load_project", () => dependencies.projects.getOwned(command.projectId, command.userId));
  if (!project) throw new VideoError("video_project_not_found", "The video project does not exist.");

  const briefRevision = await trace.run("load_brief", () => dependencies.briefRevisions.latestOwned(command.projectId, command.userId));
  if (!briefRevision?.isComplete) throw new VideoError("video_approval_incomplete", "The brief is not complete yet.");

  const parsedBrief = videoBriefSchema.safeParse(briefRevision.brief);
  if (!parsedBrief.success) throw new VideoError("video_input_invalid", "The stored brief is not readable.");
  if (!isBriefDraftComplete(parsedBrief.data, project.videoType)) {
    throw new VideoError("video_approval_incomplete", "The brief is missing information required for this video. Continue the interview before composing.");
  }
  const brief = toValidationBrief(parsedBrief.data);
  trace.event("validate_brief", "completed");

  const recipe = recipeById(project.videoType);
  const designPack = await trace.run("load_design_pack", () => dependencies.designPack.load(BUILT_IN_DESIGN_PACK));
  const catalog = await trace.run("load_catalog", () => dependencies.loadCatalog());
  const assets = (await trace.run("load_assets", () => dependencies.assets.listOwned(command.projectId, command.userId)))
    .filter((asset) => asset.deletedAt === undefined && asset.moderationStatus !== "blocked")
    .map((asset) => ({
      id: asset.id,
      objectKey: asset.objectKey,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      fileName: `${asset.id}.${extensionFor(asset.mimeType)}`,
    }));
  const assetIds = assets.map((asset) => asset.id);

  const artDirection = await trace.run("art_direction", () => runArtDirector(
    {
      userId: command.userId,
      projectId: command.projectId,
      recipe,
      brief,
      designPack,
      assets: assets.map((asset) => ({ id: asset.id, fileName: asset.fileName, mimeType: asset.mimeType })),
      language: project.settings.language,
      durationSeconds: project.settings.durationSeconds,
      aspectRatio: project.settings.aspectRatio,
    },
    { ai: dependencies.ai, createRequestId: dependencies.createId },
  ));

  const artDirectionRevision = await trace.run("save_art_direction", () => dependencies.artDirectionRevisions.create({
    projectId: command.projectId,
    userId: command.userId,
    schemaVersion: BUILT_IN_DESIGN_PACK.version,
    artDirection: artDirection.artDirection,
    generatedBy: artDirection.generatedBy,
    sourceMessageIds: briefRevision.sourceMessageIds,
  }));

  const plannerCommand = {
    userId: command.userId,
    projectId: command.projectId,
    recipe,
    brief,
    designPack,
    artDirection: artDirection.artDirection,
    candidates: selectCatalogCandidates({
      catalog,
      recipe,
      artDirection: artDirection.artDirection,
      aspectRatio: project.settings.aspectRatio,
      durationSeconds: project.settings.durationSeconds,
    }).candidates,
    assetIds,
    language: project.settings.language,
    format: {
      aspectRatio: project.settings.aspectRatio,
      fps: COMPOSITION_FPS,
      durationSeconds: project.settings.durationSeconds,
    },
  };
  trace.event("select_candidates", "completed");

  const plan = await trace.run("composition_plan", () => runCompositionPlanner(plannerCommand, { ai: dependencies.ai, createRequestId: dependencies.createId, catalog }));

  const frozen = await trace.run("compile", () => dependencies.compile({
    userId: command.userId,
    projectId: command.projectId,
    brief,
    artDirection: artDirection.artDirection,
    spec: plan.spec,
    designPack,
    assets,
    resolution: project.settings.resolution,
    language: project.settings.language,
  }));

  const compositionRevision = await trace.run("save_composition", () => dependencies.compositionRevisions.create({
    projectId: command.projectId,
    userId: command.userId,
    schemaVersion: COMPOSITION_SPEC_VERSION,
    briefRevisionId: briefRevision.id,
    artDirectionRevisionId: artDirectionRevision.id,
    designPackId: designPack.manifest.styleId,
    designPackVersion: designPack.manifest.version,
    spec: plan.spec,
    validationReport: { ok: true, issues: [] },
    candidates: plannerCommand.candidates.map((candidate) => ({ name: candidate.name, score: candidate.score, beats: candidate.beats })),
    isFallback: false,
    generatedBy: {
      profileId: frozen.author.profileId,
      provider: frozen.author.provider,
      model: frozen.author.model,
      promptVersion: COMPOSITION_AUTHOR_PROMPT_VERSION,
      requestId: frozen.author.requestId,
    },
  }));

  const artifact = await trace.run("save_artifact", () => dependencies.artifacts.create({
    id: dependencies.createId(),
    projectId: command.projectId,
    userId: command.userId,
    compositionRevisionId: compositionRevision.id,
    designPackId: designPack.manifest.styleId,
    designPackVersion: designPack.manifest.version,
    compilerVersion: COMPILER_VERSION,
    moduleVersions: frozen.moduleVersions,
    assetHashes: frozen.assetHashes,
    catalogComponents: frozen.catalogComponents,
    compositionHash: frozen.compositionHash,
    artifactPrefix: frozen.prefix,
  }));

  await trace.run("record_composition_event", () => dependencies.events.record({
    projectId: command.projectId,
    userId: command.userId,
    event: "composition_planned",
    compositionRevisionId: compositionRevision.id,
    recipe: recipe.id,
    designPackId: designPack.manifest.styleId,
    designPackVersion: designPack.manifest.version,
    catalogComponents: frozen.catalogComponents,
    plannerLatencyMs: plan.ai.latencyMs,
    isFallback: false,
    llmCostAmount: plan.ai.estimatedCost && frozen.author.estimatedCost?.currency === plan.ai.estimatedCost.currency
      ? plan.ai.estimatedCost.amount + frozen.author.estimatedCost.amount : null,
    llmCostCurrency: plan.ai.estimatedCost && frozen.author.estimatedCost?.currency === plan.ai.estimatedCost.currency
      ? plan.ai.estimatedCost.currency : null,
  }));

  return {
    compositionRevisionId: compositionRevision.id,
    artifactId: artifact.id,
    compositionHash: frozen.compositionHash,
    isFallback: false,
    validationIssues: plan.issues,
  };
  });
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
