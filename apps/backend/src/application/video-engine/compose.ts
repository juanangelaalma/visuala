import type { AIService } from "../../domain/ai-service/contracts";
import { videoBriefSchema } from "../../domain/video/brief";
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
import { assertFallbackValid, runCompositionPlanner } from "./composition-planner";
import type { CompileCommand, FrozenArtifact } from "./compile";
import { toValidationBrief } from "./validation-brief";

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
  /** Why the model's plan lost, when it did. Empty on a first-try success. */
  validationIssues: readonly ValidationIssue[];
};

/**
 * One planning pass end to end: direction, catalog shortlist, spec, validation, compile, freeze. Everything
 * it decided is stored before it returns, so a render later replays bytes rather than decisions.
 */
export async function runComposition(command: ComposeCommand, dependencies: ComposeDependencies): Promise<ComposeResult> {
  const project = await dependencies.projects.getOwned(command.projectId, command.userId);
  if (!project) throw new VideoError("video_project_not_found", "The video project does not exist.");

  const briefRevision = await dependencies.briefRevisions.latestOwned(command.projectId, command.userId);
  if (!briefRevision?.isComplete) throw new VideoError("video_approval_incomplete", "The brief is not complete yet.");

  const parsedBrief = videoBriefSchema.safeParse(briefRevision.brief);
  if (!parsedBrief.success) throw new VideoError("video_input_invalid", "The stored brief is not readable.");
  const brief = toValidationBrief(parsedBrief.data);

  const recipe = recipeById(project.videoType);
  const designPack = await dependencies.designPack.load(BUILT_IN_DESIGN_PACK);
  const catalog = await dependencies.loadCatalog();
  const assets = (await dependencies.assets.listOwned(command.projectId, command.userId))
    .filter((asset) => asset.deletedAt === undefined && asset.moderationStatus === "allowed")
    .map((asset) => ({
      id: asset.id,
      objectKey: asset.objectKey,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      fileName: `${asset.id}.${extensionFor(asset.mimeType)}`,
    }));
  const assetIds = assets.map((asset) => asset.id);

  const artDirection = await runArtDirector(
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
  );

  const artDirectionRevision = await dependencies.artDirectionRevisions.create({
    projectId: command.projectId,
    userId: command.userId,
    schemaVersion: BUILT_IN_DESIGN_PACK.version,
    artDirection: artDirection.artDirection,
    generatedBy: artDirection.generatedBy,
    sourceMessageIds: briefRevision.sourceMessageIds,
  });

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

  const plan = assertFallbackValid(
    await runCompositionPlanner(plannerCommand, { ai: dependencies.ai, createRequestId: dependencies.createId, catalog }),
    plannerCommand,
    catalog,
  );

  const compositionRevision = await dependencies.compositionRevisions.create({
    projectId: command.projectId,
    userId: command.userId,
    schemaVersion: COMPOSITION_SPEC_VERSION,
    briefRevisionId: briefRevision.id,
    artDirectionRevisionId: artDirectionRevision.id,
    designPackId: designPack.manifest.styleId,
    designPackVersion: designPack.manifest.version,
    spec: plan.spec,
    validationReport: { ok: plan.issues.length === 0, issues: plan.issues },
    candidates: plannerCommand.candidates.map((candidate) => ({ name: candidate.name, score: candidate.score, beats: candidate.beats })),
    isFallback: plan.isFallback,
    generatedBy: plan.generatedBy,
  });

  const frozen = await dependencies.compile({
    projectId: command.projectId,
    spec: plan.spec,
    designPack,
    assets,
    resolution: project.settings.resolution,
    language: project.settings.language,
  });

  const artifact = await dependencies.artifacts.create({
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
  });

  await dependencies.events.record({
    projectId: command.projectId,
    userId: command.userId,
    event: plan.isFallback ? "composition_fallback" : "composition_planned",
    compositionRevisionId: compositionRevision.id,
    recipe: recipe.id,
    designPackId: designPack.manifest.styleId,
    designPackVersion: designPack.manifest.version,
    catalogComponents: frozen.catalogComponents,
    plannerLatencyMs: plan.ai?.latencyMs ?? null,
    isFallback: plan.isFallback,
    llmCostAmount: plan.ai?.estimatedCost?.amount ?? null,
    llmCostCurrency: plan.ai?.estimatedCost?.currency ?? null,
  });

  return {
    compositionRevisionId: compositionRevision.id,
    artifactId: artifact.id,
    compositionHash: frozen.compositionHash,
    isFallback: plan.isFallback,
    validationIssues: plan.issues,
  };
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
