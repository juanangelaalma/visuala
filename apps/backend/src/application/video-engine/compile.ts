import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { buildComposition, type CompileAsset, type CompiledComposition } from "../../domain/video-engine/compiler";
import { catalogInstances, type CompositionSpec } from "../../domain/video-engine/composition";
import { compositionArtifactPrefix } from "../../domain/video-engine/artifact-manifest";
import type { LoadedDesignPack } from "../../infrastructure/video-engine/fs-design-pack-source";
import type { ArtifactFile, CompositionArtifactStore } from "../../infrastructure/video-engine/composition-artifact-store";
import type { CatalogInstaller } from "../../infrastructure/video-engine/catalog-installer";

export type CompileDependencies = {
  installer: CatalogInstaller;
  artifactStore: CompositionArtifactStore;
  /** The composition writer, injected so this use case never constructs infrastructure itself. */
  write: (compiled: CompiledComposition, targetDir: string) => Promise<void>;
  /** A throwaway directory per compile: the artifact's only durable copy is what was uploaded. */
  createScratchDir?: () => Promise<string>;
};

export type CompileCommand = {
  projectId: string;
  spec: CompositionSpec;
  designPack: LoadedDesignPack;
  assets: readonly CompileAsset[];
  resolution: "720p" | "1080p";
  language: string;
};

export type FrozenArtifact = {
  compositionHash: string;
  /** Where the artifact lives in object storage. */
  prefix: string;
  moduleVersions: Record<string, string>;
  assetHashes: Record<string, string>;
  catalogComponents: string[];
};

/**
 * Compiles one spec and freezes it: the bytes are written to a scratch directory, re-read from disk, and
 * uploaded as one content-addressed artifact. Nothing downstream recompiles, so preview and export render
 * the same bytes.
 */
export async function compileComposition(command: CompileCommand, dependencies: CompileDependencies): Promise<FrozenArtifact> {
  const scratchDir = await (dependencies.createScratchDir ?? defaultScratchDir)();
  try {
    const blocks = await dependencies.installer.install(catalogInstances(command.spec), join(scratchDir, "install"));

    const compiled: CompiledComposition = buildComposition({
      spec: command.spec,
      designPack: command.designPack.manifest,
      assets: command.assets,
      blocks,
      resolution: command.resolution,
      language: command.language,
    });

    const artifactDir = join(scratchDir, "artifact");
    await dependencies.write(compiled, artifactDir);

    const files = await readArtifactDirectory(artifactDir);
    const prefix = compositionArtifactPrefix(command.projectId, compiled.compositionHash);
    await dependencies.artifactStore.write(prefix, { compositionHash: compiled.compositionHash, files });

    return {
      compositionHash: compiled.compositionHash,
      prefix,
      moduleVersions: compiled.moduleVersions,
      assetHashes: Object.fromEntries(compiled.assets.map((asset) => [asset.path, asset.sha256])),
      catalogComponents: [...blocks.keys()],
    };
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

/** Every file the writer placed, keyed by its path inside the artifact, sorted for a stable manifest. */
export async function readArtifactDirectory(artifactDir: string): Promise<ArtifactFile[]> {
  const files: ArtifactFile[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push({ path: relative(artifactDir, path).split("\\").join("/"), bytes: await readFile(path) });
    }
  }

  await walk(artifactDir);
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

async function defaultScratchDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "visuala-compose-"));
}
