import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ProjectAssetResolver, deleteProjectAsset, listProjectAssets, registerProjectAsset } from "./assets";
import type { CreateProjectAssetInput } from "../../domain/video/contracts";
import type { ProjectAsset, VideoProject } from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
/** A valid UUID with a hex letter, so an upper-cased request spelling differs from the stored id. */
const REQUEST_PROJECT_ID = "3a333333-3333-4333-8333-333333333333";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));

/** The stored hash is the real hash of the stored bytes, which is what the resolver re-checks. */
const storedSha256 = createHash("sha256").update(PNG).digest("hex");

/** The persisted row the fixtures answer reads with. */
function storedAsset(): ProjectAsset {
  return {
    id: ASSET_ID,
    projectId: PROJECT_ID,
    objectKey: `video-projects/${PROJECT_ID}/${ASSET_ID}.png`,
    mimeType: "image/png",
    byteSize: PNG.length,
    sha256: storedSha256,
    width: 2,
    height: 3,
    moderationStatus: "pending",
  } as ProjectAsset;
}

function dependencies(overrides: { status?: string; existingAssets?: unknown[] } = {}) {
  return {
    createId: () => ASSET_ID,
    limits: { maxAssetsPerProject: 2, maxProjectAssetBytes: 1024, minImageDimension: 1, maxImageDimension: 8000 },
    projects: { getOwned: vi.fn(async (): Promise<VideoProject | null> => ({ id: PROJECT_ID, status: overrides.status ?? "interviewing" }) as VideoProject) },
    assets: {
      create: vi.fn(async (input: CreateProjectAssetInput): Promise<ProjectAsset> => ({ ...input, moderationStatus: "pending", createdAt: "created" })),
      getOwned: vi.fn(async (): Promise<ProjectAsset | null> => storedAsset()),
      listOwned: vi.fn(async (): Promise<ProjectAsset[]> => (overrides.existingAssets ?? [storedAsset()]) as ProjectAsset[]),
      sumActiveBytes: vi.fn(async (): Promise<number> => 0),
      softDelete: vi.fn(async (): Promise<void> => undefined),
    },
    objectStore: {
      write: vi.fn(async (): Promise<void> => undefined),
      read: vi.fn(async (): Promise<Uint8Array> => PNG),
      delete: vi.fn(async (): Promise<void> => undefined),
    },
  };
}

describe("registerProjectAsset", () => {
  it("writes the object before the row and returns the asset", async () => {
    const deps = dependencies();

    const asset = await registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps);

    expect(deps.objectStore.write).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`, PNG, "image/png");
    expect(asset.mimeType).toBe("image/png");
  });

  it("builds the object key from the canonical project id, not the request string", async () => {
    const deps = dependencies();

    const asset = await registerProjectAsset({ userId: USER_ID, projectId: REQUEST_PROJECT_ID.toUpperCase(), bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps);

    expect(deps.objectStore.write).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`, PNG, "image/png");
    expect(asset.projectId).toBe(PROJECT_ID);
  });

  it("refuses an upload without a rights confirmation", async () => {
    const deps = dependencies();

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: false }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.objectStore.write).not.toHaveBeenCalled();
  });

  it("validates the real bytes rather than the declared type", async () => {
    const deps = dependencies();

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: Uint8Array.from([71, 73, 70, 56, 57, 97]), declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toMatchObject({ code: "video_asset_invalid" });
    expect(deps.objectStore.write).not.toHaveBeenCalled();
  });

  it("refuses an asset once the project is no longer editable", async () => {
    const deps = dependencies({ status: "rendering" });

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toMatchObject({ code: "video_state_conflict" });
  });

  it("refuses an upload into a project that was deleted while the request was in flight", async () => {
    const deps = dependencies();
    deps.projects.getOwned
      .mockResolvedValueOnce({ id: PROJECT_ID, status: "interviewing" } as VideoProject)
      .mockResolvedValueOnce(null);

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toMatchObject({ code: "video_project_not_found" });
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
  });

  it("drops the inserted row as well as the object when the project closes during the upload", async () => {
    const deps = dependencies();
    deps.projects.getOwned
      .mockResolvedValueOnce({ id: PROJECT_ID, status: "interviewing" } as VideoProject)
      .mockResolvedValueOnce({ id: PROJECT_ID, status: "rendering" } as VideoProject);

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toMatchObject({ code: "video_project_not_found" });
    expect(deps.assets.create).toHaveBeenCalled();
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
    expect(deps.assets.softDelete).toHaveBeenCalledWith(ASSET_ID, USER_ID);
  });

  it("enforces the configured asset count and byte ceiling", async () => {
    const full = dependencies({ existingAssets: [{ id: "a" }, { id: "b" }] });
    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, full))
      .rejects.toMatchObject({ code: "video_asset_limit_reached" });

    const heavy = dependencies();
    heavy.assets.sumActiveBytes.mockResolvedValue(1024);
    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, heavy))
      .rejects.toMatchObject({ code: "video_asset_limit_reached" });
  });

  it("deletes the object when the row insert fails", async () => {
    const deps = dependencies();
    deps.assets.create.mockRejectedValue(new Error("insert failed"));

    await expect(registerProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, bytes: PNG, declaredMimeType: "image/png", rightsConfirmed: true }, deps))
      .rejects.toThrowError("insert failed");
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
  });
});

describe("deleteProjectAsset", () => {
  it("soft deletes the row and then the object", async () => {
    const deps = dependencies();

    await deleteProjectAsset({ userId: USER_ID, projectId: PROJECT_ID, assetId: ASSET_ID }, deps);

    expect(deps.assets.softDelete).toHaveBeenCalledWith(ASSET_ID, USER_ID);
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
  });

  it("hides an asset that belongs to another user's project", async () => {
    const deps = dependencies();
    deps.assets.getOwned.mockResolvedValue(null);

    await expect(deleteProjectAsset({ userId: "user-b", projectId: PROJECT_ID, assetId: ASSET_ID }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
  });

  it("deletes an owned asset whose request spells the project id differently", async () => {
    const deps = dependencies();

    await deleteProjectAsset({ userId: USER_ID, projectId: REQUEST_PROJECT_ID.toUpperCase(), assetId: ASSET_ID }, deps);

    expect(deps.assets.softDelete).toHaveBeenCalledWith(ASSET_ID, USER_ID);
    expect(deps.objectStore.delete).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
  });
});

describe("listProjectAssets", () => {
  it("returns previews only for assets the caller owns", async () => {
    const deps = dependencies();
    const signedUrl = vi.fn(async (key: string) => `https://signed.example/${key}`);

    const assets = await listProjectAssets({ userId: USER_ID, projectId: PROJECT_ID }, { ...deps, signedUrl });

    expect(signedUrl).toHaveBeenCalledWith(`video-projects/${PROJECT_ID}/${ASSET_ID}.png`);
    expect(assets).toEqual([{ id: ASSET_ID, mimeType: "image/png", byteSize: PNG.length, width: 2, height: 3, moderationStatus: "pending", previewUrl: `https://signed.example/video-projects/${PROJECT_ID}/${ASSET_ID}.png` }]);
  });

  it("rejects a project the caller does not own before signing anything", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);
    const signedUrl = vi.fn();

    await expect(listProjectAssets({ userId: "user-b", projectId: PROJECT_ID }, { ...deps, signedUrl })).rejects.toMatchObject({ code: "video_project_not_found" });
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it("keeps the list when one row's object is gone, answering a null preview for it", async () => {
    const deps = dependencies();
    const orphan = { ...storedAsset(), id: "55555555-5555-4555-8555-555555555555", objectKey: `video-projects/${PROJECT_ID}/gone.png` };
    deps.assets.listOwned.mockResolvedValue([storedAsset(), orphan]);
    const signedUrl = vi.fn(async (key: string) => (key.endsWith("gone.png") ? null : `https://signed.example/${key}`));

    const assets = await listProjectAssets({ userId: USER_ID, projectId: PROJECT_ID }, { ...deps, signedUrl });

    expect(assets.map((asset) => asset.previewUrl)).toEqual([`https://signed.example/video-projects/${PROJECT_ID}/${ASSET_ID}.png`, null]);
    expect(assets).toHaveLength(2);
  });
});

describe("ProjectAssetResolver", () => {
  it("re-validates stored bytes and refuses mutated ones", async () => {
    const deps = dependencies();
    deps.objectStore.read.mockResolvedValue(PNG);

    const resolver = new ProjectAssetResolver(deps.assets, deps.objectStore);

    await expect(resolver.resolve(ASSET_ID, USER_ID, { maxImageBytes: 1_000_000, maxImageWidth: 8000, maxImageHeight: 8000 })).resolves.toMatchObject({ assetId: ASSET_ID, mimeType: "image/png" });

    deps.objectStore.read.mockResolvedValue(Uint8Array.from([...PNG, 0]));
    await expect(new ProjectAssetResolver(deps.assets, deps.objectStore).resolve(ASSET_ID, USER_ID, { maxImageBytes: 1_000_000, maxImageWidth: 8000, maxImageHeight: 8000 }))
      .rejects.toMatchObject({ code: "video_asset_invalid" });
  });

  it("refuses a blocked asset and another user's asset", async () => {
    const deps = dependencies();
    deps.objectStore.read.mockResolvedValue(PNG);
    deps.assets.getOwned.mockResolvedValue({ id: ASSET_ID, objectKey: "k", mimeType: "image/png", byteSize: PNG.length, sha256: storedSha256, width: 2, height: 3, moderationStatus: "blocked" } as ProjectAsset);
    const limits = { maxImageBytes: 1_000_000, maxImageWidth: 8000, maxImageHeight: 8000 };

    await expect(new ProjectAssetResolver(deps.assets, deps.objectStore).resolve(ASSET_ID, USER_ID, limits)).rejects.toMatchObject({ code: "video_asset_invalid" });

    deps.assets.getOwned.mockResolvedValue(null);
    await expect(new ProjectAssetResolver(deps.assets, deps.objectStore).resolve(ASSET_ID, "user-b", limits)).rejects.toMatchObject({ code: "video_asset_invalid" });
  });
});
