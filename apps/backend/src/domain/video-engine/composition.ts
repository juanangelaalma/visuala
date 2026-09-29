import { z } from "zod";

export const COMPOSITION_SPEC_VERSION = "composition-spec@v1";
/** The id the runtime uses for `window.__timelines` and `data-composition-id`. */
export const COMPOSITION_ID = "main";
export const COMPOSITION_FPS = 30;
export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export const SCENE_TRANSITIONS = ["cut", "fade", "slide", "zoom"] as const;
/** A scene shorter than this is a flash, not a beat; the validator refuses it. */
export const MIN_SCENE_SECONDS = 0.5;
export const MIN_DURATION_SECONDS = 4;
export const MAX_DURATION_SECONDS = 30;

const moduleInstanceSchema = z
  .object({
    /** An internal module id or a catalog item name; the validator resolves it against both. */
    id: z.string().trim().min(1),
    kind: z.enum(["internal", "catalog"]),
    version: z.string().trim().min(1).optional(),
    content: z.record(z.string(), z.string()),
  })
  .strict();

const sceneSchema = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9_]+$/),
    durationFrames: z.number().int().min(1),
    transition: z.enum(SCENE_TRANSITIONS).optional(),
    modules: z.array(moduleInstanceSchema).min(1),
  })
  .strict();

export const compositionSpecSchema = z
  .object({
    schemaVersion: z.literal(COMPOSITION_SPEC_VERSION),
    format: z
      .object({
        aspectRatio: z.enum(ASPECT_RATIOS),
        fps: z.number().int().min(1).max(120),
        durationSeconds: z.number().int().min(MIN_DURATION_SECONDS).max(MAX_DURATION_SECONDS),
      })
      .strict(),
    style: z.object({ id: z.string().trim().min(1), version: z.string().trim().min(1) }).strict(),
    scenes: z.array(sceneSchema).min(1),
  })
  .strict();

export type CompositionModuleInstance = z.infer<typeof moduleInstanceSchema>;
export type CompositionScene = z.infer<typeof sceneSchema>;
export type CompositionSpec = z.infer<typeof compositionSpecSchema>;

export type CompositionFormat = CompositionSpec["format"];

export type SceneTimelineEntry = { id: string; startFrames: number; durationFrames: number; transition: string };

/** Scene start frames in spec order. The compiler and the duration validator share this one walk. */
export function sceneTimeline(spec: Pick<CompositionSpec, "scenes">): SceneTimelineEntry[] {
  let cursor = 0;
  return spec.scenes.map((scene) => {
    const entry = {
      id: scene.id,
      startFrames: cursor,
      durationFrames: scene.durationFrames,
      transition: scene.transition ?? "cut",
    };
    cursor += scene.durationFrames;
    return entry;
  });
}

export function totalFrames(spec: Pick<CompositionSpec, "scenes">): number {
  return spec.scenes.reduce((total, scene) => total + scene.durationFrames, 0);
}

export function framesToSeconds(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1000) / 1000;
}

/** The catalog blocks a spec names, in first-use order, each with the values to bake into that block. */
export function catalogInstances(spec: CompositionSpec): { name: string; vars: Record<string, string> }[] {
  const seen = new Map<string, Record<string, string>>();
  for (const scene of spec.scenes) {
    for (const instance of scene.modules) {
      if (instance.kind !== "catalog") continue;
      if (!seen.has(instance.id)) seen.set(instance.id, { ...instance.content });
    }
  }
  return [...seen.entries()].map(([name, vars]) => ({ name, vars }));
}
