import { z } from "zod";
import { VIDEO_STYLE_IDS, outputSettingsSchema } from "./settings";

/** Bumped from `render-input@v1` when the render plan landed: v1 did not name a template or an fps. */
export const RENDER_INPUT_SCHEMA_VERSION = "render-input@v2";

/**
 * The frozen input of a render. It is written once, before any render starts, and the worker reads
 * the row instead of re-deriving the brief: the seed pinned here is what makes a rerender
 * reproducible. The schema is strict on purpose, so a worker built for an older snapshot cannot
 * silently ignore a field it does not understand: adding template or style-version fields is a
 * breaking change and requires raising `RENDER_INPUT_SCHEMA_VERSION`.
 */
export const renderJobInputSnapshotSchema = z.object({
  schemaVersion: z.literal(RENDER_INPUT_SCHEMA_VERSION),
  briefRevisionId: z.string().uuid(),
  storyboardRevisionId: z.string().uuid(),
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsSchema,
  variantSeed: z.string().uuid(),
  /** Frozen so a registry or style-pack edit cannot silently change what a queued job renders. */
  templateId: z.string().trim().min(1),
  templateVersion: z.string().trim().min(1),
  stylePackVersion: z.string().trim().min(1),
  fps: z.number().int().min(1).max(240),
}).strict();

export type RenderJobInputSnapshot = z.infer<typeof renderJobInputSnapshotSchema>;
