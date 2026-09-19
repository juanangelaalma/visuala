import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { resolveOwnedAsset } from "./resolve-asset";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));
const SHA256 = createHash("sha256").update(PNG).digest("hex");

function asset(overrides = {}) { return { id: ASSET_ID, userId: USER_ID, objectKey: `ai-assets/${USER_ID}/${ASSET_ID}.png`, mimeType: "image/png" as const, byteSize: PNG.length, sha256: SHA256, width: 2, height: 3, validated: true, createdAt: "created", ...overrides }; }
function dependencies(record: ReturnType<typeof asset> | null = asset(), bytes = PNG) { return { repository: { create: vi.fn(), getOwned: vi.fn().mockResolvedValue(record) }, objectStore: { write: vi.fn(), read: vi.fn().mockResolvedValue(bytes), delete: vi.fn() } }; }

describe("resolveOwnedAsset", () => {
  it("rejects another user's asset before object read", async () => {
    const deps = dependencies(null);
    await expect(resolveOwnedAsset({ assetId: ASSET_ID, userId: USER_ID }, deps)).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
    expect(deps.objectStore.read).not.toHaveBeenCalled();
  });

  it("accepts exact lower provider boundaries", async () => {
    await expect(resolveOwnedAsset({ assetId: ASSET_ID, userId: USER_ID, limits: { maxImageBytes: PNG.length, maxImageWidth: 2, maxImageHeight: 3 } }, dependencies())).resolves.toMatchObject({ assetId: ASSET_ID });
  });

  it.each([
    { maxImageBytes: PNG.length - 1, maxImageWidth: 2, maxImageHeight: 3 },
    { maxImageBytes: PNG.length, maxImageWidth: 1, maxImageHeight: 3 },
    { maxImageBytes: PNG.length, maxImageWidth: 2, maxImageHeight: 2 },
  ])("rejects a lower provider boundary", async (limits) => {
    await expect(resolveOwnedAsset({ assetId: ASSET_ID, userId: USER_ID, limits }, dependencies())).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects non-positive or non-finite limit %s", async (limit) => {
    await expect(resolveOwnedAsset({ assetId: ASSET_ID, userId: USER_ID, limits: { maxImageBytes: limit, maxImageWidth: 2, maxImageHeight: 3 } }, dependencies())).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });

  it("rejects same-size same-dimension tampering by digest", async () => {
    const changed = Uint8Array.from(PNG);
    changed[40] ^= 1;
    await expect(resolveOwnedAsset({ assetId: ASSET_ID, userId: USER_ID }, dependencies(asset(), changed))).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });
  });
});
