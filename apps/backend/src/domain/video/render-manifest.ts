import { createHash } from "node:crypto";
import { frameDimensions } from "./settings";
import type { AssetMimeType } from "../ai-service/assets";
import type { RenderJobInputSnapshot } from "./render-input";
import type { StoryboardScene } from "./storyboard";
import type {
  VideoAspectRatio, VideoDurationSeconds, VideoOutputSettings, VideoResolution, VideoStyleId, VideoType,
} from "./types";

/**
 * A domain module may not import `application`, so this is a local copy of the three-line helper
 * `application/ai-service/register-asset.ts` exports rather than an import of it. It is exported
 * because the composition writer hashes asset bytes with it too, and infrastructure may not import
 * `application` either.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const RENDER_MANIFEST_VERSION = "render-manifest@v1";

export type RenderManifestAsset = {
  assetId: string;
  objectKey: string;
  sha256: string;
  mimeType: AssetMimeType;
  byteSize: number;
  width: number;
  height: number;
  /** The name the composition references as `assets/<fileName>`; derived so it can never drift. */
  fileName: string;
};

export type RenderManifestScene = {
  order: number;
  startSeconds: number;
  endSeconds: number;
  visual: string;
  onScreenTitle: string;
  onScreenCopy: string;
  caption: string | null;
  transition: StoryboardScene["transition"];
  assetIds: string[];
};

export type RenderManifest = {
  manifestVersion: string;
  projectId: string;
  renderJobId: string;
  briefRevisionId: string;
  storyboardRevisionId: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  stylePackVersion: string;
  templateId: string;
  templateVersion: string;
  variantSeed: string;
  fps: number;
  width: number;
  height: number;
  durationSeconds: VideoDurationSeconds;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  language: string;
  productName: string;
  brandName: string | null;
  keyMessage: string;
  callToAction: string | null;
  orderDestination: string | null;
  menuItems: readonly { name: string; price: string | null }[];
  scenes: readonly RenderManifestScene[];
  assets: readonly RenderManifestAsset[];
};

export type RenderManifestSource = {
  projectId: string;
  renderJobId: string;
  snapshot: RenderJobInputSnapshot;
  videoType: VideoType;
  fps: number;
  scenes: readonly StoryboardScene[];
  brief: { productName: string; brandName: string | null; keyMessage: string; callToAction: string | null; orderDestination: string | null; menuItems: readonly { name: string; price: string | null }[] | null };
  assets: readonly { id: string; objectKey: string; sha256: string; mimeType: AssetMimeType; byteSize: number; width: number; height: number }[];
};

/**
 * The immutable input of one render. Everything a frame depends on is here: the storyboard timing, the
 * template and style-pack versions, the fps and frame size, and the hash of every asset byte. A
 * rerender of the same manifest therefore produces the same frames, and a fingerprint of this object
 * is what the `video_versions` row records.
 */
export function buildRenderManifest(source: RenderManifestSource): RenderManifest {
  const { width, height } = frameDimensions(source.snapshot.settings);

  // Only the assets a scene actually references are frozen: an unrelated upload must not be able to
  // change this render's bytes or its fingerprint.
  const referenced = new Set(source.scenes.flatMap((scene) => scene.assetIds));
  const byId = new Map(source.assets.map((asset) => [asset.id, asset]));
  const assets = [...referenced].map((assetId) => {
    const asset = byId.get(assetId);
    if (!asset) throw new Error(`Scene references asset ${assetId}, which the project does not have.`);
    return {
      assetId: asset.id,
      objectKey: asset.objectKey,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      fileName: `${asset.id}.${extensionFor(asset.mimeType)}`,
    } satisfies RenderManifestAsset;
  });

  return {
    manifestVersion: RENDER_MANIFEST_VERSION,
    projectId: source.projectId,
    renderJobId: source.renderJobId,
    briefRevisionId: source.snapshot.briefRevisionId,
    storyboardRevisionId: source.snapshot.storyboardRevisionId,
    videoType: source.videoType,
    styleId: source.snapshot.styleId,
    stylePackVersion: source.snapshot.stylePackVersion,
    templateId: source.snapshot.templateId,
    templateVersion: source.snapshot.templateVersion,
    variantSeed: source.snapshot.variantSeed,
    fps: source.fps,
    width,
    height,
    durationSeconds: source.snapshot.settings.durationSeconds,
    aspectRatio: source.snapshot.settings.aspectRatio,
    resolution: source.snapshot.settings.resolution,
    language: source.snapshot.settings.language,
    productName: source.brief.productName,
    brandName: source.brief.brandName,
    keyMessage: source.brief.keyMessage,
    callToAction: source.brief.callToAction,
    orderDestination: source.brief.orderDestination,
    menuItems: source.brief.menuItems ?? [],
    scenes: source.scenes.map((scene) => ({
      order: scene.order,
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      visual: scene.visual,
      onScreenTitle: scene.onScreenTitle,
      onScreenCopy: scene.onScreenCopy,
      caption: scene.caption,
      transition: scene.transition,
      assetIds: [...scene.assetIds],
    })),
    assets,
  };
}

/** A stable fingerprint of the frozen input. `video_versions.manifest_hash` is checked as 64 hex chars. */
export function renderManifestFingerprint(manifest: RenderManifest): string {
  return sha256Hex(new TextEncoder().encode(canonicalJson(manifest)));
}

/** Recursively key-sorted JSON, so two structurally equal manifests cannot hash differently. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export function extensionFor(mimeType: AssetMimeType): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "bin";
}
