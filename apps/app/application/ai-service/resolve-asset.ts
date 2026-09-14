import type { AssetObjectStore, AssetRepository } from "../../domain/ai-service/assets";
import { MAX_ASSET_BYTES } from "../../domain/ai-service/assets";
import { AIError } from "../../domain/ai-service/errors";
import { isPositiveFinite, sha256, validateImage } from "./register-asset";

type Limits = { maxImageBytes: number; maxImageWidth: number; maxImageHeight: number };
type ResolveAssetInput = { assetId: string; userId: string; limits?: Limits };
type Dependencies = { repository: AssetRepository; objectStore: AssetObjectStore };

export async function resolveOwnedAsset(input: ResolveAssetInput, dependencies: Dependencies) {
  assertLimits(input.limits);
  const asset = await dependencies.repository.getOwned(input.assetId, input.userId);
  if (!asset?.validated || asset.deletedAt) throw invalidAsset();
  const maxBytes = Math.min(MAX_ASSET_BYTES, input.limits?.maxImageBytes ?? MAX_ASSET_BYTES);
  const bytes = await dependencies.objectStore.read(asset.objectKey, maxBytes);
  const image = validateImage(bytes, asset.mimeType, maxBytes);
  if (image.byteSize !== asset.byteSize || image.width !== asset.width || image.height !== asset.height || sha256(bytes) !== asset.sha256) throw invalidAsset();
  if (input.limits && (image.width > input.limits.maxImageWidth || image.height > input.limits.maxImageHeight)) throw invalidAsset();
  return { assetId: asset.id, bytes, mimeType: asset.mimeType };
}

function assertLimits(limits?: Limits) { if (limits && !Object.values(limits).every(isPositiveFinite)) throw invalidAsset(); }
function invalidAsset() { return new AIError({ code: "AI_INPUT_INVALID", safeMessage: "The image is unavailable or invalid.", requestId: "asset", retryable: false }); }
