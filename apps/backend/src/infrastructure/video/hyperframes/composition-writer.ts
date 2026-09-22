import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildComposition } from "../../../domain/video/composition";
import { extensionFor, sha256Hex } from "../../../domain/video/render-manifest";
import { RenderError } from "../../../domain/video/errors";
import { MAX_ASSET_BYTES } from "../../../domain/ai-service/assets";
import type { AssetObjectStore } from "../../../domain/ai-service/assets";
import type { RenderManifest } from "../../../domain/video/render-manifest";

export type CompositionWriterDependencies = {
  objectStore: Pick<AssetObjectStore, "read">;
  /** Absolute path to the vendored `gsap.min.js`; resolved once from the installed package. */
  gsapScriptPath: string;
  copyFile?: typeof copyFile;
};

/**
 * Writes a self-contained HyperFrames project for one manifest. The asset bytes are re-verified
 * against the hash the manifest froze: approval pinned those bytes, and an object overwritten since
 * then must fail the render rather than be burned into a published video.
 */
export async function writeComposition(
  manifest: RenderManifest,
  workDir: string,
  dependencies: CompositionWriterDependencies,
): Promise<void> {
  const copy = dependencies.copyFile ?? copyFile;
  const { files } = buildComposition(manifest);

  await mkdir(join(workDir, "assets"), { recursive: true });
  await mkdir(join(workDir, "vendor"), { recursive: true });

  for (const file of files) {
    const target = join(workDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents, "utf8");
  }

  await copy(dependencies.gsapScriptPath, join(workDir, "vendor", "gsap.min.js"));

  const referenced = new Set(manifest.scenes.flatMap((scene) => scene.assetIds));
  const frozen = new Map(manifest.assets.map((asset) => [asset.assetId, asset]));

  for (const assetId of referenced) {
    const asset = frozen.get(assetId);
    if (!asset) throw new RenderError("render_asset_missing", "A scene references an asset this render was not given.");
    const bytes = await readAsset(asset.objectKey, dependencies.objectStore);
    if (sha256Hex(bytes) !== asset.sha256) {
      throw new RenderError("render_asset_mutated", "An asset changed after the render was approved.");
    }
    await writeFile(join(workDir, "assets", `${asset.assetId}.${extensionFor(asset.mimeType)}`), bytes);
  }
}

async function readAsset(objectKey: string, objectStore: Pick<AssetObjectStore, "read">): Promise<Uint8Array> {
  try {
    return await objectStore.read(objectKey, MAX_ASSET_BYTES);
  } catch {
    throw new RenderError("render_asset_missing", "An asset this render needs is no longer available.");
  }
}
