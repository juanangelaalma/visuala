import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { registerAsset } from "./register-asset";
import { resolveOwnedAsset } from "./resolve-asset";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAFof//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z", "base64"));
const WEBP = Uint8Array.from([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0,0,0,0,0,1,0,0,2,0,0]);

function hash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function deps(bytes = PNG) {
  const record = { id: ASSET_ID, userId: USER_ID, objectKey: `ai-assets/${USER_ID}/${ASSET_ID}.png`, mimeType: "image/png" as const, byteSize: PNG.byteLength, sha256: hash(PNG), width: 2, height: 3, validated: true, createdAt: "2026-09-12T00:00:00.000Z" };
  return { repository: { create: vi.fn(async (asset) => ({ ...asset, createdAt: record.createdAt })), getOwned: vi.fn().mockResolvedValue(record) }, objectStore: { write: vi.fn(), read: vi.fn().mockResolvedValue(bytes), delete: vi.fn() }, createAssetId: () => ASSET_ID };
}

describe("complete image validation", () => {
  it.each([["image/png", PNG], ["image/jpeg", JPEG], ["image/webp", WEBP]] as const)("accepts a complete %s fixture", async (mimeType, bytes) => {
    await expect(registerAsset({ userId: USER_ID, bytes, declaredMimeType: mimeType }, deps(bytes))).resolves.toMatchObject({ mimeType });
  });

  it.each([["PNG", PNG], ["JPEG", JPEG], ["WebP", WEBP]] as const)("rejects a structurally truncated %s", async (_label, bytes) => {
    await expect(registerAsset({ userId: USER_ID, bytes: bytes.slice(0, -2), declaredMimeType: "image/png" }, deps())).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it("rejects same-size same-dimension object tampering", async () => {
    const changed = Uint8Array.from(PNG);
    changed[changed.length - 5] ^= 1;
    await expect(resolveOwnedAsset({ assetId: ASSET_ID, userId: USER_ID }, deps(changed))).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid provider limit %s", async (maxImageBytes) => {
    await expect(resolveOwnedAsset({ assetId: ASSET_ID, userId: USER_ID, limits: { maxImageBytes, maxImageWidth: 2, maxImageHeight: 3 } }, deps())).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });
});
