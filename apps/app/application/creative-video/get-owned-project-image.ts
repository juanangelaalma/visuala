import type { AssetMimeType } from "@/domain/ai-service/assets";
import type { CreativeVideoRepository } from "@/domain/creative-video/contracts";

export type OwnedProjectAssetResolver = {
  resolve(assetId: string, userId: string): Promise<{ assetId: string; bytes: Uint8Array; mimeType: AssetMimeType }>;
};

type Dependencies = { projects: CreativeVideoRepository; assets: OwnedProjectAssetResolver };
type Input = { projectId: string; userId: string };

export async function getOwnedCreativeProjectImage(dependencies: Dependencies, input: Input) {
  const aggregate = await dependencies.projects.getOwnedProject(input.projectId, input.userId);
  if (!aggregate) return null;
  return dependencies.assets.resolve(aggregate.project.assetId, input.userId);
}
