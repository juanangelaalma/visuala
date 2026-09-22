import { describe, expect, it } from "vitest";
import { buildRenderManifest, renderManifestFingerprint } from "./render-manifest";
import { assetFixture, manifestSourceFixture, sceneFixture } from "./render-manifest.test-helpers";

describe("buildRenderManifest", () => {
  it("freezes the template, the style pack version, and the fps from the snapshot", () => {
    const manifest = buildRenderManifest(manifestSourceFixture());
    expect(manifest.templateId).toBe("product-spotlight");
    expect(manifest.templateVersion).toBe("1.0.0");
    expect(manifest.stylePackVersion).toBe("1.0.0");
    expect(manifest.fps).toBe(30);
    expect(manifest.variantSeed).toBe("99999999-9999-4999-8999-999999999999");
  });

  it("pins every referenced asset by hash and by the file name the composition will use", () => {
    const manifest = buildRenderManifest(manifestSourceFixture());
    expect(manifest.assets).toEqual([
      { assetId: "asset-1", objectKey: "video-projects/p/asset-1.png", sha256: "a".repeat(64), mimeType: "image/png", byteSize: 10, width: 800, height: 800, fileName: "asset-1.png" },
    ]);
  });

  it("drops an asset no scene references, so an unrelated upload cannot change a render", () => {
    const manifest = buildRenderManifest(manifestSourceFixture({
      assets: [assetFixture(), assetFixture({ id: "asset-unused" })],
    }));
    expect(manifest.assets.map((asset) => asset.assetId)).toEqual(["asset-1"]);
  });

  it("refuses a scene that points at an asset the project does not have", () => {
    expect(() => buildRenderManifest(manifestSourceFixture({
      scenes: [{ ...sceneFixture(), assetIds: ["ghost"] }],
    }))).toThrowError(/ghost/);
  });
});

describe("renderManifestFingerprint", () => {
  it("is a stable 64-character sha256 of a canonical serialization", () => {
    const manifest = buildRenderManifest(manifestSourceFixture());
    const fingerprint = renderManifestFingerprint(manifest);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(renderManifestFingerprint(manifest)).toBe(fingerprint);
  });

  it("changes when any frozen input changes", () => {
    const source = manifestSourceFixture();
    const base = buildRenderManifest(source);
    // The settings live inside the snapshot, so an override has to spread it rather than replace it.
    const changed = buildRenderManifest({
      ...source,
      snapshot: { ...source.snapshot, settings: { ...source.snapshot.settings, durationSeconds: 15 } },
    });
    expect(renderManifestFingerprint(changed)).not.toBe(renderManifestFingerprint(base));
  });
});
