import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256Hex } from "../../domain/video-engine/hash";
import { CompositionError } from "../../domain/video-engine/errors";
import type { AssetObjectStore } from "../../domain/ai-service/assets";
import type { CompiledComposition, CompiledFontRef } from "../../domain/video-engine/compiler";

export type CompositionWriterDependencies = {
  objectStore: Pick<AssetObjectStore, "read">;
  /** Absolute path to the vendored `gsap.min.js`; resolved once from the installed package. */
  gsapScriptPath: string;
  /** Absolute path to a font file shipped by a `@fontsource` package. */
  resolveFontFile: (font: CompiledFontRef) => string;
  maxAssetBytes?: number;
};

/** Materialises the compiled artifact, checking every copied byte against the frozen hash: an asset overwritten after approval must fail rather than be published. */
export async function writeComposition(compiled: CompiledComposition, targetDir: string, dependencies: CompositionWriterDependencies): Promise<void> {
  for (const file of compiled.files) {
    await write(targetDir, file.path, file.contents);
  }

  for (const binary of compiled.binaries) {
    const bytes = await readVerified(binary.sourcePath, binary.sha256, "composition_block_mutated");
    await write(targetDir, binary.path, bytes);
  }

  for (const font of compiled.fonts) {
    const bytes = await readFont(dependencies.resolveFontFile(font));
    await write(targetDir, font.path, bytes);
  }

  for (const asset of compiled.assets) {
    const bytes = await readVerifiedAsset(asset.objectKey, asset.sha256, dependencies);
    await write(targetDir, asset.path, bytes);
  }

  const vendorDir = join(targetDir, "vendor");
  await mkdir(vendorDir, { recursive: true });
  await copyFile(dependencies.gsapScriptPath, join(vendorDir, "gsap.min.js"));
}

async function write(targetDir: string, relativePath: string, contents: string | Uint8Array): Promise<void> {
  const destination = join(targetDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

async function readVerified(path: string, expected: string, code: "composition_block_mutated"): Promise<Uint8Array> {
  const bytes = await readFile(path);
  if (sha256Hex(bytes) !== expected) throw new CompositionError(code, `An installed file changed after the composition was compiled: ${path}.`);
  return bytes;
}

async function readVerifiedAsset(objectKey: string, expected: string, dependencies: CompositionWriterDependencies): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = await dependencies.objectStore.read(objectKey, dependencies.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES);
  } catch {
    throw new CompositionError("composition_asset_missing", "An asset this composition needs is no longer available.");
  }
  if (sha256Hex(bytes) !== expected) throw new CompositionError("composition_asset_mutated", "An asset changed after the composition was approved.");
  return bytes;
}

async function readFont(path: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch {
    throw new CompositionError("composition_font_missing", `The Design Pack font ${path} is not installed.`);
  }
}

const DEFAULT_MAX_ASSET_BYTES = 10 * 1024 * 1024;
