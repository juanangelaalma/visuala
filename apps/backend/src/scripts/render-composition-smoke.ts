import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { frameSizeFor } from "../domain/video-engine/format";
import { buildComposition } from "../domain/video-engine/compiler";
import { sha256Hex } from "../domain/video-engine/hash";
import { createCatalogInstaller } from "../infrastructure/video-engine/catalog-installer";
import { createFsDesignPackSource } from "../infrastructure/video-engine/fs-design-pack-source";
import { createHyperframesCli } from "../infrastructure/video-engine/hyperframes-cli";
import { gsapScriptPath, resolveFontFile } from "../infrastructure/video-engine/font-file";
import { writeComposition } from "../infrastructure/video-engine/composition-writer";
import { HyperFramesRenderEngine } from "../infrastructure/video-engine/hyperframes-render-engine";
import { buildSmokeSpec, parseCompositionSmokeOptions } from "./composition-smoke-options";

const run = promisify(execFile);

/**
 * Operator check for the composition engine: does this host turn a Composition Spec into an MP4?
 *
 * It uses no API and no Supabase. Without `--block` it renders the internal modules alone; with one it
 * installs a real registry item and hosts it as a sub-composition, which is the only way to prove the
 * catalog path end to end before the planner depends on it.
 */
async function main(): Promise<void> {
  const options = parseCompositionSmokeOptions(process.argv.slice(2));
  const root = process.cwd();
  const styleId = "creative-mode";
  const styleVersion = "1";
  const frame = frameSizeFor(options.aspectRatio, options.resolution);

  const designPack = (await createFsDesignPackSource(root).load({ id: styleId, version: styleVersion })).manifest;
  const workDir = await mkdtemp(join(tmpdir(), "composition-smoke-"));
  const artifactDir = join(workDir, "artifact");
  const outputPath = join(options.outDir ? resolve(options.outDir) : workDir, "smoke.mp4");

  try {
    const asset = await writeSyntheticAsset(workDir);
    const scratchDir = join(workDir, "install");
    await mkdir(scratchDir, { recursive: true });

    const spec = buildSmokeSpec({
      aspectRatio: options.aspectRatio,
      durationSeconds: options.durationSeconds,
      fps: options.fps,
      styleId,
      styleVersion,
      assetId: asset.id,
      block: options.block,
    });

    const blocks = options.block
      ? await createCatalogInstaller({ cli: createHyperframesCli() }).install([{ name: options.block }], scratchDir)
      : new Map();

    const compiled = buildComposition({ spec, designPack, assets: [asset], blocks, resolution: options.resolution, language: "id" });

    await writeComposition(compiled, artifactDir, {
      objectStore: {
        async read(key: string) {
          if (key !== asset.objectKey) throw new Error(`unexpected object ${key}`);
          return readFile(assetPath(workDir, asset));
        },
      },
      gsapScriptPath: gsapScriptPath(),
      resolveFontFile,
    });

    console.log(`artifact: ${artifactDir}`);
    console.log(`compositionHash: ${compiled.compositionHash}`);

    const engine = new HyperFramesRenderEngine({ maxOutputBytes: 500 * 1024 * 1024, maxWorkers: 1, lowMemoryMode: false, disableGpu: false });
    const result = await engine.render({
      artifactDir,
      outputPath,
      width: frame.width,
      height: frame.height,
      fps: options.fps,
      durationSeconds: options.durationSeconds,
      quality: options.quality,
    });

    console.log(JSON.stringify({ outputPath: result.outputPath, ...result.probe }, null, 2));
    if (options.keep) console.log(`kept workspace: ${workDir}`);
  } finally {
    if (!options.keep) await rm(workDir, { recursive: true, force: true });
  }
}

type SyntheticAsset = { id: string; objectKey: string; sha256: string; mimeType: string; fileName: string };

async function writeSyntheticAsset(workDir: string): Promise<SyntheticAsset> {
  const file = join(workDir, "asset-1.jpg");
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=#7a4227:s=1080x1920", "-frames:v", "1", file]);
  const bytes = await readFile(file);
  return { id: "asset-1", objectKey: "smoke/asset-1.jpg", sha256: sha256Hex(bytes), mimeType: "image/jpeg", fileName: "asset-1.jpg" };
}

function assetPath(workDir: string, asset: SyntheticAsset): string {
  return join(workDir, asset.fileName);
}

await main();
