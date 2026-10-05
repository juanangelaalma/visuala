import { canonicalJson, sha256Hex } from "./hash";
import { frameSizeFor } from "./format";
import { COMPOSITION_ID } from "./composition";
import type { CompositionSpec } from "./composition";
import type { DesignPackManifest } from "./design-pack";

export const COMPILER_VERSION = "2.0.0";

export type CompileAsset = {
  id: string;
  objectKey: string;
  sha256: string;
  mimeType: string;
  fileName: string;
};

/** A registry item that has already been installed and normalised into a sub-composition. */
export type CompiledBlock = {
  name: string;
  /** Path inside the artifact, e.g. `compositions/badge-pop.html`. */
  entryPath: string;
  entryContents: string;
  /** Every other file the block ships, copied verbatim with the hash of its bytes. */
  files: readonly CompiledBinaryRef[];
};

export type CompileInput = {
  html: string;
  spec: CompositionSpec;
  designPack: DesignPackManifest;
  assets: readonly CompileAsset[];
  blocks: ReadonlyMap<string, CompiledBlock>;
  resolution: "720p" | "1080p";
  language: string;
};

export type CompiledFile = { path: string; contents: string };
export type CompiledAssetRef = { path: string; objectKey: string; sha256: string };
export type CompiledFontRef = { path: string; package: string; file: string };

export type CompiledBinaryRef = { path: string; sha256: string; sourcePath: string };

export type CompiledComposition = {
  compositionId: string;
  files: readonly CompiledFile[];
  /** Non-text files from the installed blocks, copied into the artifact from `sourcePath`. */
  binaries: readonly CompiledBinaryRef[];
  /** Uploaded assets the composition references, fetched from the object store by `objectKey`. */
  assets: readonly CompiledAssetRef[];
  fonts: readonly CompiledFontRef[];
  moduleVersions: Record<string, string>;
  /** Identity of the frozen artifact: any change to content, versions, or asset bytes changes it. */
  compositionHash: string;
};

class CompilerError extends Error {
  constructor(readonly code: "compiler_block_missing" | "compiler_file_collision", message: string) {
    super(message);
    this.name = "CompilerError";
  }
}

/** Packages AI-authored HTML and vetted dependencies without modifying their contents. */
export function buildComposition(input: CompileInput): CompiledComposition {
  const { spec, designPack } = input;
  const frame = frameSizeFor(spec.format.aspectRatio, input.resolution);
  const blocks = new Map<string, CompiledBlock>();
  for (const scene of spec.scenes) {
    for (const instance of scene.modules) {
      if (instance.kind !== "catalog" || blocks.has(instance.id)) continue;
      const block = input.blocks.get(instance.id);
      if (!block) throw new CompilerError("compiler_block_missing", `Catalog item ${instance.id} was not installed before compilation.`);
      blocks.set(instance.id, block);
    }
  }

  const moduleVersions: Record<string, string> = {};
  const files: CompiledFile[] = [{ path: "index.html", contents: input.html }];
  const binaries: CompiledBinaryRef[] = [];
  for (const block of blocks.values()) {
    if (files.some((file) => file.path === block.entryPath) || binaries.some((file) => file.path === block.entryPath)) {
      throw new CompilerError("compiler_file_collision", `Multiple files provide ${block.entryPath}.`);
    }
    files.push({ path: block.entryPath, contents: block.entryContents });
    for (const file of block.files) {
      if (binaries.some((existing) => existing.path === file.path) || files.some((existing) => existing.path === file.path)) {
        throw new CompilerError("compiler_file_collision", `Multiple files provide ${file.path}.`);
      }
      binaries.push(file);
    }
  }

  const assets: CompiledAssetRef[] = input.assets.map((asset) => ({
    path: `assets/${asset.fileName}`,
    objectKey: asset.objectKey,
    sha256: asset.sha256,
  }));
  const fonts: CompiledFontRef[] = designPack.fonts.map((font) => ({
    path: `fonts/${font.file}`,
    package: font.package,
    file: font.file,
  }));
  const paths = new Set(files.map((file) => file.path).concat(binaries.map((file) => file.path)));
  for (const dependency of [...assets, ...fonts]) {
    if (paths.has(dependency.path)) {
      throw new CompilerError("compiler_file_collision", `Multiple files provide ${dependency.path}.`);
    }
    paths.add(dependency.path);
  }

  return {
    compositionId: COMPOSITION_ID,
    files,
    binaries,
    assets,
    fonts,
    moduleVersions,
    compositionHash: hashComposition({ spec, designPack, frame, files, binaries, assets, fonts, moduleVersions }),
  };
}

/** Hashes packaged text and binary digests plus pinned font identities (font bytes are resolved by the artifact writer). */
export function hashComposition(input: {
  spec: CompositionSpec;
  designPack: DesignPackManifest;
  frame: { width: number; height: number };
  files: readonly CompiledFile[];
  binaries: readonly { path: string; sha256: string }[];
  assets: readonly CompiledAssetRef[];
  fonts: readonly CompiledFontRef[];
  moduleVersions: Record<string, string>;
}): string {
  return sha256Hex(
    new TextEncoder().encode(
      canonicalJson({
        compilerVersion: COMPILER_VERSION,
        spec: input.spec,
        style: input.designPack,
        frame: input.frame,
        moduleVersions: input.moduleVersions,
        assets: [...input.assets].sort(byPath).map((asset) => ({ path: asset.path, sha256: asset.sha256 })),
        fonts: [...input.fonts].sort(byPath),
        binaries: [...input.binaries].sort(byPath).map((binary) => ({ path: binary.path, sha256: binary.sha256 })),
        files: [...input.files].sort(byPath).map((file) => ({ path: file.path, sha256: sha256Hex(new TextEncoder().encode(file.contents)) })),
      }),
    ),
  );
}


function byPath<T extends { path: string }>(left: T, right: T): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

export { CompilerError };
