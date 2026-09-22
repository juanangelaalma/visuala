import { RENDER_INPUT_SCHEMA_VERSION } from "./render-input";
import type { RenderManifest, RenderManifestAsset, RenderManifestScene, RenderManifestSource } from "./render-manifest";
import type { StoryboardScene } from "./storyboard";

/**
 * Fixtures for the render subsystem's unit tests. They live in a non-test module because three
 * production-adjacent test files in this folder and three later tasks' tests all read the same
 * shapes, and a mismatch between two hand-written fixtures is how a manifest test stops proving
 * anything. A type-only import from `./render-manifest` keeps this file loadable before that
 * module's test suite exists.
 */

/** The hash every fixture asset carries: sixty-four `a`s, which is the shape the column check wants. */
export const FIXTURE_SHA256 = "a".repeat(64);

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const RENDER_JOB_ID = "66666666-6666-4666-8666-666666666666";
const BRIEF_REVISION_ID = "44444444-4444-4444-8444-444444444444";
const STORYBOARD_REVISION_ID = "55555555-5555-4555-8555-555555555555";
const VARIANT_SEED = "99999999-9999-4999-8999-999999999999";

/** The manifest asset shape: what a request uses, and what `renderManifestFingerprint` hashes. */
export function manifestAssetFixture(overrides: Partial<RenderManifestAsset> = {}): RenderManifestAsset {
  return {
    assetId: "asset-1",
    objectKey: "video-projects/p/asset-1.png",
    sha256: FIXTURE_SHA256,
    mimeType: "image/png",
    byteSize: 10,
    width: 800,
    height: 800,
    fileName: "asset-1.png",
    ...overrides,
  };
}

/** The stored-asset shape a `RenderManifestSource` is built from: the id is named `id` here. */
export function assetFixture(overrides: Partial<RenderManifestSource["assets"][number]> = {}): RenderManifestSource["assets"][number] {
  return {
    id: "asset-1",
    objectKey: "video-projects/p/asset-1.png",
    sha256: FIXTURE_SHA256,
    mimeType: "image/png",
    byteSize: 10,
    width: 800,
    height: 800,
    ...overrides,
  };
}

/** A storyboard scene, as the model and the storyboard normalizer produce it. */
export function sceneFixture(overrides: Partial<StoryboardScene> = {}): StoryboardScene {
  return {
    order: 1,
    startSeconds: 0,
    endSeconds: 4,
    visual: "Produk tampil dari dekat",
    onScreenTitle: "Kopi Nusantara",
    onScreenCopy: "Seduh pagi jadi lebih mudah",
    voiceOver: null,
    caption: null,
    assetIds: ["asset-1"],
    audioCue: null,
    transition: "fade",
    ...overrides,
  };
}

/** The same scene as the manifest carries it: no voice-over or audio cue, and no storyboard extras. */
export function manifestSceneFixture(overrides: Partial<RenderManifestScene> = {}): RenderManifestScene {
  return {
    order: 1,
    startSeconds: 0,
    endSeconds: 4,
    visual: "Produk tampil dari dekat",
    onScreenTitle: "Kopi Nusantara",
    onScreenCopy: "Seduh pagi jadi lebih mudah",
    caption: null,
    transition: "fade",
    assetIds: ["asset-1"],
    ...overrides,
  };
}

/** A 9:16, 1080x1920, ten-second `product_promo` manifest with two scenes and one asset. */
export function manifestFixture(overrides: Partial<RenderManifest> = {}): RenderManifest {
  return {
    manifestVersion: "render-manifest@v1",
    projectId: PROJECT_ID,
    renderJobId: RENDER_JOB_ID,
    briefRevisionId: BRIEF_REVISION_ID,
    storyboardRevisionId: STORYBOARD_REVISION_ID,
    videoType: "product_promo",
    styleId: "bold_pop",
    stylePackVersion: "1.0.0",
    templateId: "product-spotlight",
    templateVersion: "1.0.0",
    variantSeed: VARIANT_SEED,
    fps: 30,
    width: 1080,
    height: 1920,
    durationSeconds: 10,
    aspectRatio: "9:16",
    resolution: "1080p",
    language: "id",
    productName: "Kopi Nusantara",
    brandName: null,
    keyMessage: "Seduh pagi jadi lebih mudah",
    callToAction: "Pesan sekarang",
    orderDestination: null,
    menuItems: [],
    scenes: [
      manifestSceneFixture(),
      manifestSceneFixture({ order: 2, startSeconds: 4, endSeconds: 10 }),
    ],
    assets: [manifestAssetFixture()],
    ...overrides,
  };
}

/** The raw material an intake freezes: a brief, a storyboard, the stored assets, and the snapshot. */
export function manifestSourceFixture(overrides: Partial<RenderManifestSource> = {}): RenderManifestSource {
  return {
    projectId: PROJECT_ID,
    renderJobId: RENDER_JOB_ID,
    snapshot: {
      schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
      briefRevisionId: BRIEF_REVISION_ID,
      storyboardRevisionId: STORYBOARD_REVISION_ID,
      styleId: "bold_pop",
      settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: false, musicEnabled: false },
      variantSeed: VARIANT_SEED,
      templateId: "product-spotlight",
      templateVersion: "1.0.0",
      stylePackVersion: "1.0.0",
      fps: 30,
    },
    videoType: "product_promo",
    fps: 30,
    scenes: [
      sceneFixture(),
      sceneFixture({ order: 2, startSeconds: 4, endSeconds: 10 }),
    ],
    brief: {
      productName: "Kopi Nusantara",
      brandName: null,
      keyMessage: "Seduh pagi jadi lebih mudah",
      callToAction: "Pesan sekarang",
      orderDestination: null,
      menuItems: null,
    },
    assets: [assetFixture()],
    ...overrides,
  };
}
