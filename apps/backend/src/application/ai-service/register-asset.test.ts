import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { registerAsset } from "./register-asset";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAFof//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z", "base64"));
const WEBP = Uint8Array.from([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0,0,0,0,0,1,0,0,2,0,0]);

function dependencies() {
  return {
    createAssetId: () => ASSET_ID,
    repository: {
      create: vi.fn(async (asset) => ({ ...asset, validated: true, createdAt: "created" })),
      getOwned: vi.fn(async () => null),
    },
    objectStore: { write: vi.fn(), read: vi.fn(), delete: vi.fn() },
  };
}

describe("registerAsset", () => {
  it.each([["image/png", PNG], ["image/jpeg", JPEG], ["image/webp", WEBP]] as const)("detects complete %s bytes", async (mimeType, bytes) => {
    const asset = await registerAsset({ userId: USER_ID, bytes, declaredMimeType: mimeType }, dependencies());
    expect(asset).toMatchObject({ id: ASSET_ID, mimeType, width: 2, height: 3, byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  });

  it("rejects a truncated JPEG start-of-frame segment", async () => {
    const bytes = Uint8Array.from([255, 216, 255, 192, 0, 8, 8, 0, 3, 0]);

    await expect(registerAsset({ userId: USER_ID, bytes, declaredMimeType: "image/jpeg" }, dependencies())).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it("accepts an image exactly 10 MB", async () => {
    const paddingLength = 10 * 1024 * 1024 - PNG.length - 12;
    const ancillaryChunk = Uint8Array.from([paddingLength >>> 24, paddingLength >>> 16, paddingLength >>> 8, paddingLength, 116, 69, 83, 116, ...new Uint8Array(paddingLength), 0, 0, 0, 0]);
    const bytes = Uint8Array.from([...PNG.slice(0, -12), ...ancillaryChunk, ...PNG.slice(-12)]);
    await expect(registerAsset({ userId: USER_ID, bytes, declaredMimeType: "image/png" }, dependencies())).resolves.toMatchObject({ byteSize: bytes.length });
  });

  it("rejects an image above 10 MB", async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024 + 1);
    bytes.set(PNG);
    bytes.set(PNG.slice(-12), bytes.length - 12);
    await expect(registerAsset({ userId: USER_ID, bytes, declaredMimeType: "image/png" }, dependencies())).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it.each(["../user", "user/asset", "not-a-uuid"])("rejects unsafe user ID %s", async (userId) => {
    await expect(registerAsset({ userId, bytes: PNG, declaredMimeType: "image/png" }, dependencies())).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it("rejects an unsafe generated asset ID", async () => {
    const deps = dependencies();
    deps.createAssetId = () => "../asset";
    await expect(registerAsset({ userId: USER_ID, bytes: PNG, declaredMimeType: "image/png" }, deps)).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it("does not let callers choose validation state", async () => {
    const deps = dependencies();
    await registerAsset({ userId: USER_ID, bytes: PNG, declaredMimeType: "image/png" }, deps);
    expect(deps.repository.create.mock.calls[0]?.[0]).not.toHaveProperty("validated");
  });
});
