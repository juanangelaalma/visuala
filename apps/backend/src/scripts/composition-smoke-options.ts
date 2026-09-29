import { COMPOSITION_SPEC_VERSION } from "../domain/video-engine/composition";
import type { CompositionModuleInstance, CompositionSpec } from "../domain/video-engine/composition";
import type { RecipeAspectRatio } from "../domain/video-engine/recipes/types";
import type { VideoResolution } from "../domain/video-engine/format";

export type CompositionSmokeOptions = {
  aspectRatio: RecipeAspectRatio;
  resolution: VideoResolution;
  durationSeconds: number;
  fps: number;
  quality: "draft" | "standard" | "high";
  /** A catalog item to install and host in the second scene; empty renders internal modules only. */
  block: string | null;
  keep: boolean;
  outDir: string | null;
};

export const SMOKE_DEFAULTS: CompositionSmokeOptions = {
  aspectRatio: "9:16",
  resolution: "1080p",
  durationSeconds: 12,
  fps: 30,
  quality: "draft",
  block: null,
  keep: false,
  outDir: null,
};

export function parseCompositionSmokeOptions(args: readonly string[]): CompositionSmokeOptions {
  const options: CompositionSmokeOptions = { ...SMOKE_DEFAULTS };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const [flag, inline] = arg.includes("=") ? (arg.split("=", 2) as [string, string]) : [arg, undefined];
    const value = () => {
      const next = inline ?? args[index + 1];
      if (next === undefined) throw new Error(`${flag} needs a value.`);
      if (inline === undefined) index += 1;
      return next;
    };

    switch (flag) {
      case "--ratio":
        options.aspectRatio = assertRatio(value());
        break;
      case "--resolution":
        options.resolution = assertResolution(value());
        break;
      case "--duration":
        options.durationSeconds = assertDuration(value());
        break;
      case "--fps":
        options.fps = assertFps(value());
        break;
      case "--quality":
        options.quality = assertQuality(value());
        break;
      case "--block":
        options.block = value();
        break;
      case "--out":
        options.outDir = value();
        break;
      case "--keep":
        options.keep = true;
        break;
      default:
        throw new Error(`Unknown option ${flag}.`);
    }
  }

  return options;
}

function assertRatio(value: string): RecipeAspectRatio {
  if (value !== "9:16" && value !== "1:1" && value !== "16:9") throw new Error(`Unsupported ratio ${value}.`);
  return value;
}

function assertResolution(value: string): VideoResolution {
  if (value !== "720p" && value !== "1080p") throw new Error(`Unsupported resolution ${value}.`);
  return value;
}

function assertDuration(value: string): number {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error(`Unsupported duration ${value}.`);
  return duration;
}

function assertFps(value: string): number {
  const fps = Number(value);
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error(`Unsupported fps ${value}.`);
  return fps;
}

function assertQuality(value: string): CompositionSmokeOptions["quality"] {
  if (value !== "draft" && value !== "standard" && value !== "high") throw new Error(`Unsupported quality ${value}.`);
  return value;
}

export type SmokeSpecInput = {
  aspectRatio: RecipeAspectRatio;
  durationSeconds: number;
  fps: number;
  styleId: string;
  styleVersion: string;
  /** Asset id for the product beat; omitted when the smoke has no synthetic image. */
  assetId?: string;
  /** A catalog item name hosted by the second scene instead of internal modules. */
  block?: string | null;
  blockVars?: Readonly<Record<string, string>>;
};

/**
 * The smoke composition: reveal, message, close. It exists to prove the pipeline renders, not to be
 * a template, so it is assembled here rather than by the planner.
 */
export function buildSmokeSpec(input: SmokeSpecInput): CompositionSpec {
  const total = input.durationSeconds * input.fps;
  const first = Math.floor(total / 3);
  const second = Math.floor(total / 3);

  const reveal: CompositionModuleInstance[] = input.assetId
    ? [
        { id: "BackgroundTexture", kind: "internal" as const, content: { tone: "cream" } },
        { id: "ProductHero", kind: "internal" as const, content: { assetId: input.assetId } },
      ]
    : [
        { id: "BackgroundTexture", kind: "internal" as const, content: { tone: "pink" } },
        { id: "Headline", kind: "internal" as const, content: { text: "Julumpia" } },
      ];

  const message: CompositionModuleInstance[] = input.block
    ? [{ id: input.block, kind: "catalog" as const, content: { ...(input.blockVars ?? {}) } }]
    : [
        { id: "BackgroundTexture", kind: "internal" as const, content: { tone: "cream2" } },
        { id: "Headline", kind: "internal" as const, content: { text: "Diskon 20%" } },
        { id: "OfferBadge", kind: "internal" as const, content: { text: "20% OFF" } },
      ];

  return {
    schemaVersion: COMPOSITION_SPEC_VERSION,
    format: { aspectRatio: input.aspectRatio, fps: input.fps, durationSeconds: input.durationSeconds },
    style: { id: input.styleId, version: input.styleVersion },
    scenes: [
      { id: "scene_1", transition: "cut", durationFrames: first, modules: reveal },
      { id: "scene_2", transition: "fade", durationFrames: second, modules: message },
      {
        id: "scene_3",
        durationFrames: total - first - second,
        modules: [
          { id: "BackgroundTexture", kind: "internal", content: { tone: "green" } },
          { id: "CTA", kind: "internal", content: { text: "Pesan sekarang" } },
        ],
      },
    ],
  };
}
