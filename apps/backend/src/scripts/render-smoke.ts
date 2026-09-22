/**
 * An operator-facing smoke run: it answers one question, "does this host render?", without going
 * through the API, Supabase, or a browser session.
 *
 * A script under `src/scripts/` is a process entry point, so it constructs infrastructure directly,
 * the same way an application services factory does. That is the one place outside a factory where
 * this is allowed.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildRenderManifest, sha256Hex } from "@/domain/video/render-manifest";
import { HyperFramesRenderEngine } from "@/infrastructure/video/hyperframes/hyperframes-render-engine";
import { gsapScriptPath } from "@/infrastructure/video/hyperframes/gsap-script";
import { RENDER_INPUT_SCHEMA_VERSION } from "@/domain/video/render-input";
import { readRenderWorkerConfig } from "@/domain/video/render-config";

const run = promisify(execFile);

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const aspectRatio = flag("aspect-ratio", "9:16") as "9:16" | "1:1" | "16:9";
const resolution = flag("resolution", "720p") as "720p" | "1080p";
const durationSeconds = Number(flag("duration", "6")) as 6 | 10 | 15;
const keep = process.argv.includes("--keep");
const config = readRenderWorkerConfig();

// A real image, generated locally: the smoke run must exercise the same materialization path a
// production render does, asset hash check included. Its side matches the dimensions the manifest
// declares, so the frozen metadata describes the file that is actually on disk. The rendered frame
// size still comes from `settings`, which is why a 1080p run produces a 1080x1920 file.
const assetSide = resolution === "1080p" ? 1080 : 720;
const dir = await mkdtemp(join(tmpdir(), "hf-smoke-"));
const assetPath = join(dir, "asset.png");
await run("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=0xEFF31B:s=${assetSide}x${assetSide}`, "-frames:v", "1", assetPath]);
const assetBytes = new Uint8Array(await readFile(assetPath));

const manifest = buildRenderManifest({
  projectId: "00000000-0000-4000-8000-000000000001",
  renderJobId: "00000000-0000-4000-8000-000000000002",
  snapshot: {
    schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
    briefRevisionId: "00000000-0000-4000-8000-000000000003",
    storyboardRevisionId: "00000000-0000-4000-8000-000000000004",
    styleId: "bold_pop",
    settings: { durationSeconds, aspectRatio, resolution, language: "id", voiceOverEnabled: false, musicEnabled: false },
    variantSeed: "00000000-0000-4000-8000-000000000005",
    templateId: "product-spotlight",
    templateVersion: "1.0.0",
    stylePackVersion: "1.0.0",
    fps: config.fps,
  },
  videoType: "product_promo",
  fps: config.fps,
  scenes: [
    { order: 1, startSeconds: 0, endSeconds: durationSeconds / 2, visual: "smoke", onScreenTitle: "Smoke", onScreenCopy: "Scene one", voiceOver: null, caption: null, assetIds: ["asset-1"], audioCue: null, transition: "fade" },
    { order: 2, startSeconds: durationSeconds / 2, endSeconds: durationSeconds, visual: "smoke", onScreenTitle: "Smoke", onScreenCopy: "Scene two", voiceOver: null, caption: null, assetIds: ["asset-1"], audioCue: null, transition: "fade" },
  ],
  brief: { productName: "Smoke", brandName: null, keyMessage: "Smoke", callToAction: null, orderDestination: null, menuItems: null },
  assets: [{ id: "asset-1", objectKey: "smoke/asset-1.png", sha256: sha256Hex(assetBytes), mimeType: "image/png", byteSize: assetBytes.byteLength, width: assetSide, height: assetSide }],
});

// The engine reads assets through the object store. A smoke run has no project in storage, so it
// serves the one generated asset directly and the hash check on it is real.
const engine = new HyperFramesRenderEngine({
  config,
  objectStore: { read: async () => assetBytes },
  gsapScriptPath: gsapScriptPath(),
});

const result = await engine.render({
  manifest,
  workDir: dir,
  outputPath: join(dir, "smoke.mp4"),
  onProgress: (percent) => process.stdout.write(`\r${Math.round(percent)}%`),
});

console.log(`\nRendered ${JSON.stringify(result, null, 2)}`);
if (keep) {
  console.log(`Work directory kept at ${dir}`);
} else {
  await rm(dir, { recursive: true, force: true });
  console.log("Work directory removed.");
}
