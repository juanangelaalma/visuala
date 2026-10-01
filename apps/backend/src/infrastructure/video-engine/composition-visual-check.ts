import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { sceneTimeline, type CompositionSpec } from "../../domain/video-engine/composition";
import { frameSizeFor } from "../../domain/video-engine/format";
import { COMPOSITION_GEOMETRY_SCRIPT, geometryResultSchema } from "./composition-geometry";
import { HyperframesCliError, type HyperframesCli } from "./hyperframes-cli";

export type CompositionVisualCheckInput = { dir: string; spec: CompositionSpec; resolution: "720p" | "1080p" };
export interface CompositionVisualGate {
  check(input: CompositionVisualCheckInput): Promise<void>;
}

export type VisualCheckIssue = {
  code: string;
  scene: string;
  selector: string;
  message: string;
  time: number;
  bbox?: { x: number; y: number; width: number; height: number };
};

export class CompositionVisualCheckError extends Error {
  readonly code = "composition_visual_check_failed";
  constructor(readonly issues: readonly VisualCheckIssue[]) {
    super(`Composition visual check failed: ${issues.slice(0, 8).map((issue) => `${issue.code}: ${issue.message} (${issue.scene} ${issue.selector} at ${issue.time}s)`).join("; ")}`);
    this.name = "CompositionVisualCheckError";
  }
}

type VisualSample = { time: number; sceneId?: string; requireAll: boolean; boundary: boolean };

export function compositionVisualSamples(spec: CompositionSpec): VisualSample[] {
  const samples: VisualSample[] = [];
  const fps = spec.format.fps;
  const lastFrame = spec.format.durationSeconds - 1 / fps;
  for (const entry of sceneTimeline(spec)) {
    const start = entry.startFrames / fps;
    const duration = entry.durationFrames / fps;
    for (const fraction of [.35, .55]) {
      samples.push({ time: Math.round((start + duration * fraction) * fps) / fps, sceneId: entry.id, requireAll: false, boundary: false });
    }
    const readable = start + Math.max(duration * .75, duration - .8);
    samples.push({ time: Math.min(lastFrame, Math.floor(readable * fps) / fps), sceneId: entry.id, requireAll: true, boundary: false });
    if (start > 0) {
      for (const offset of [-1, 0, 1]) {
        const time = (entry.startFrames + offset) / fps;
        if (time >= 0 && time <= lastFrame) samples.push({ time, requireAll: false, boundary: true });
      }
    }
  }
  return samples.sort((left, right) => left.time - right.time);
}

export function createCompositionVisualGate(options: { cli: HyperframesCli; browserPath?: string; disableGpu?: boolean }): CompositionVisualGate {
  return {
    async check(input) {
      const samples = compositionVisualSamples(input.spec);
      await options.cli.check({ dir: input.dir, at: [...new Set(samples.map((sample) => sample.time))] });
      const workDir = await mkdtemp(join(tmpdir(), "visuala-visual-check-"));
      try {
        const jobPath = join(workDir, "job.json");
        const resultPath = join(workDir, "result.json");
        await writeFile(jobPath, JSON.stringify({
          dir: input.dir,
          workDir,
          resultPath,
          fps: input.spec.format.fps,
          durationSeconds: input.spec.format.durationSeconds,
          ...frameSizeFor(input.spec.format.aspectRatio, input.resolution),
          browserPath: options.browserPath,
          disableGpu: options.disableGpu ?? true,
          samples,
          geometryScript: COMPOSITION_GEOMETRY_SCRIPT,
          fontScript: FONT_READINESS_SCRIPT,
        }));
        await promisify(execFile)("node", [
          "--experimental-strip-types",
          fileURLToPath(new URL("./composition-visual-worker.ts", import.meta.url)),
          jobPath,
        ], { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
        const report = workerResultSchema.parse(JSON.parse(await readFile(resultPath, "utf8")));
        const issues: VisualCheckIssue[] = [...report.issues];
        for (const font of report.fonts) {
          if (font.status !== "loaded") issues.push({ code: "font_missing", message: `${font.family} did not load (${font.status}).`, scene: "main", selector: "[data-composition-id=main]", time: 0 });
        }
        for (const sample of report.samples) {
          if (sample.geometry.sceneCount !== input.spec.scenes.length) {
            issues.push({ code: "scene_missing", message: `Expected ${input.spec.scenes.length} scenes, found ${sample.geometry.sceneCount}.`, scene: "main", selector: "[data-composition-id=main]", time: sample.time });
          }
          issues.push(...sample.geometry.issues.map((issue) => ({ ...issue, time: sample.time })));
        }
        if (report.samples.length !== samples.length) {
          issues.push({ code: "visual_check_unreadable", message: "The capture worker did not complete every sample.", scene: "main", selector: "[data-composition-id=main]", time: 0 });
        }
        if (issues.length) throw new CompositionVisualCheckError(issues);
      } catch (error) {
        if (error instanceof CompositionVisualCheckError || error instanceof HyperframesCliError) throw error;
        throw new CompositionVisualCheckError([{
          code: "visual_check_unreadable",
          message: error instanceof Error ? error.message : String(error),
          scene: "main",
          selector: "[data-composition-id=main]",
          time: 0,
        }]);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  };
}

const fontResultSchema = z.array(z.object({ family: z.string(), status: z.string() }));
const workerResultSchema = z.object({
  fonts: fontResultSchema,
  issues: z.array(z.object({
    code: z.string(),
    scene: z.string(),
    selector: z.string(),
    message: z.string(),
    time: z.number().finite(),
  })),
  samples: z.array(z.object({ time: z.number().finite(), geometry: geometryResultSchema })),
});
const FONT_READINESS_SCRIPT = String.raw`(async function () {
  await Promise.all(Array.from(document.fonts, async (font) => {
    try { await font.load(); } catch {}
  }));
  await document.fonts.ready;
  const fonts = Array.from(document.fonts, (font) => ({ family: font.family.replace(/^['"]|['"]$/g, ''), status: font.status }));
  const systemFamilies = /^(system-ui|sans-serif|serif|monospace|ui-monospace|Arial|Helvetica|Times New Roman|Georgia|Courier New|Verdana|Tahoma|Trebuchet MS)$/i;
  for (const module of document.querySelectorAll('.hf-module:not(.hf-BackgroundTexture)')) {
    const walker = document.createTreeWalker(module, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || !node.parentElement) continue;
      const family = getComputedStyle(node.parentElement).fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      if (!systemFamilies.test(family) && !fonts.some(font => font.family === family)) fonts.push({ family, status: 'missing' });
    }
  }
  return fonts;
})()`;
