import type { AIAsset } from "@/domain/ai-service/assets";
import type { OwnedAssetRegistration } from "@/application/ai-service/register-asset";
import type { CreateCreativeProjectResult, CreativeVideoRepository } from "@/domain/creative-video/contracts";
import type { PluginRegistry } from "@/domain/creative-video/plugin-registry";
import type { CreativeProjectAggregate, VersionRef } from "@/domain/creative-video/types";

export type CreateCreativeProjectInput = {
  userId: string;
  prompt: string;
  image: File;
  idempotencyKey: string;
  category: VersionRef;
};

export type CreateCreativeProjectDependencies = {
  projects: Pick<CreativeVideoRepository, "findByCreateKey" | "create">;
  assets: OwnedAssetRegistration;
  plugins: Pick<PluginRegistry, "resolveCategory">;
  createId(): string;
  createCleanupOperationId(): string;
  now(): Date;
  analyze(input: { userId: string; projectId: string; sourceRevision: number; requestId: string }): Promise<void>;
};

type AssetCleanupContext = { cleanupOperationId: string; requestId: string; projectId: string };

export class AssetCleanupError extends Error {
  constructor(public readonly context: AssetCleanupContext) {
    super("Registered asset cleanup failed.");
    this.name = "AssetCleanupError";
  }
}

export async function createCreativeProject(
  dependencies: CreateCreativeProjectDependencies,
  input: CreateCreativeProjectInput,
): Promise<CreativeProjectAggregate> {
  const existing = await dependencies.projects.findByCreateKey(input.userId, input.idempotencyKey);
  if (existing) return existing;

  dependencies.plugins.resolveCategory(input.category);
  const asset = await registerProductAsset(dependencies.assets, input);
  const result = await persistProjectOrRemoveAsset(dependencies, input, asset);
  if (result.created) await dependencies.analyze({ userId: input.userId, projectId: result.aggregate.project.id, sourceRevision: result.aggregate.project.revision, requestId: `creative-project-analysis:${input.idempotencyKey}` });
  return result.aggregate;
}

async function registerProductAsset(assets: OwnedAssetRegistration, input: CreateCreativeProjectInput): Promise<AIAsset> {
  const bytes = new Uint8Array(await input.image.arrayBuffer());
  return assets.register({ userId: input.userId, bytes, declaredMimeType: input.image.type });
}

async function persistProjectOrRemoveAsset(
  dependencies: CreateCreativeProjectDependencies,
  input: CreateCreativeProjectInput,
  asset: AIAsset,
): Promise<CreateCreativeProjectResult> {
  const creationInput = buildAggregateInput(dependencies, input, asset);
  try {
    const result = await dependencies.projects.create(creationInput);
    if (!result.created) await removeOrThrow(dependencies, input, asset.id, result.aggregate.project.id);
    return result;
  } catch (error) {
    if (error instanceof AssetCleanupError) throw error;
    await removeOrThrow(dependencies, input, asset.id, creationInput.project.id);
    throw error;
  }
}

async function removeOrThrow(
  dependencies: CreateCreativeProjectDependencies,
  input: CreateCreativeProjectInput,
  assetId: string,
  projectId: string,
): Promise<void> {
  try {
    await dependencies.assets.remove(assetId, input.userId);
  } catch {
    throw new AssetCleanupError({ cleanupOperationId: dependencies.createCleanupOperationId(), requestId: input.idempotencyKey, projectId });
  }
}

function buildAggregateInput(dependencies: CreateCreativeProjectDependencies, input: CreateCreativeProjectInput, asset: AIAsset) {
  const projectId = dependencies.createId();
  const createdAt = dependencies.now().toISOString();
  return {
    project: {
      id: projectId, userId: input.userId, createIdempotencyKey: input.idempotencyKey, category: input.category, state: "analyzing" as const, revision: 0,
      assetId: asset.id, activeConceptId: null, activeCompositionVersionId: null, failedStage: null, errorCode: null,
      previewGenerationCount: 0, previewQuota: 3, createdAt, updatedAt: createdAt,
    },
    message: {
      id: dependencies.createId(), projectId, role: "user" as const, kind: "brief" as const, text: input.prompt,
      assetId: asset.id, projectRevision: 0, idempotencyKey: input.idempotencyKey, createdAt,
    },
  };
}
