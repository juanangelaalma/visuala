import { createHash } from "node:crypto";
import type { AssetMimeType, AssetObjectStore, AssetRepository } from "../../domain/ai-service/assets";
import { MAX_ASSET_BYTES } from "../../domain/ai-service/assets";
import { AIError } from "../../domain/ai-service/errors";
import { parseImage } from "./image-parser";

type RegisterAssetInput = { userId: string; bytes: Uint8Array; declaredMimeType: string };
type Dependencies = { repository: AssetRepository; objectStore: AssetObjectStore; createAssetId: () => string };

export async function registerAsset(input: RegisterAssetInput, dependencies: Dependencies) {
  assertUuid(input.userId);
  const image = validateImage(input.bytes, input.declaredMimeType, MAX_ASSET_BYTES);
  const id = dependencies.createAssetId();
  assertUuid(id);
  const objectKey = makeObjectKey(input.userId, id, image.mimeType);
  await dependencies.objectStore.write(objectKey, input.bytes, image.mimeType);
  return createMetadataOrDeleteObject({ id, userId: input.userId, objectKey, ...image, sha256: sha256(input.bytes) }, dependencies);
}

export function validateImage(bytes: Uint8Array, declaredMimeType: string, maxBytes: number) {
  if (!isPositiveFinite(maxBytes) || bytes.byteLength > maxBytes) throw invalidAsset();
  const image = parseImage(bytes);
  if (!image || image.mimeType !== declaredMimeType) throw invalidAsset();
  return { ...image, byteSize: bytes.byteLength };
}

export function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export function isPositiveFinite(value: number) { return Number.isFinite(value) && value > 0; }

async function createMetadataOrDeleteObject(input: Parameters<AssetRepository["create"]>[0], dependencies: Dependencies) {
  try { return await dependencies.repository.create(input); }
  catch (error) { await dependencies.objectStore.delete(input.objectKey).catch(() => undefined); throw error; }
}

function assertUuid(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw invalidAsset(); }
function makeObjectKey(userId: string, id: string, mimeType: AssetMimeType) { return `ai-assets/${userId}/${id}.${mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1]}`; }
function invalidAsset() { return new AIError({ code: "AI_INPUT_INVALID", safeMessage: "Upload a valid JPEG, PNG, or WebP image up to 10 MB.", requestId: "asset", retryable: false }); }
