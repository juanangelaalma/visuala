import { z } from "zod";
import { VideoError } from "./errors";
import type { VideoOutputSettings } from "./types";

export const STORYBOARD_SCHEMA_NAME = "video_storyboard";
export const STORYBOARD_SCHEMA_VERSION = "v1";

/** Design-system safe-area limits for on-screen text at the smallest supported resolution. */
export const MAX_SCENE_TITLE_CHARS = 40;
export const MAX_SCENE_COPY_CHARS = 90;

export const STORYBOARD_TRANSITIONS = ["cut", "fade", "slide", "zoom"] as const;

export const storyboardSceneSchema = z.object({
  order: z.number().int().positive(),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  visual: z.string().trim().min(1).max(300),
  onScreenTitle: z.string().trim().min(1).max(MAX_SCENE_TITLE_CHARS),
  onScreenCopy: z.string().trim().min(1).max(MAX_SCENE_COPY_CHARS),
  voiceOver: z.string().trim().min(1).nullable(),
  caption: z.string().trim().min(1).nullable(),
  assetIds: z.array(z.string().uuid()),
  audioCue: z.string().trim().min(1).nullable(),
  transition: z.enum(STORYBOARD_TRANSITIONS),
}).strict();

export const storyboardSchema = z.object({ scenes: z.array(storyboardSceneSchema).min(1) }).strict();

export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;

export type StoryboardProblem =
  | "timeline_start"
  | "scene_duration"
  | "scene_order"
  | "timeline_gap"
  | "total_duration_mismatch"
  | "voice_over_missing"
  | "voice_over_unexpected"
  | "asset_reference_missing";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function storyboardTotalDurationSeconds(scenes: readonly StoryboardScene[]): number {
  return round(scenes.reduce((total, scene) => total + (scene.endSeconds - scene.startSeconds), 0));
}

/**
 * Every rule the renderer cannot recover from on its own. The AI orchestration layer calls this
 * before showing a storyboard, and approval calls it again before freezing a snapshot, so a
 * storyboard that slipped through the first check can never reach an approved job.
 */
export function findStoryboardProblems(scenes: readonly StoryboardScene[], settings: VideoOutputSettings): readonly StoryboardProblem[] {
  const problems = new Set<StoryboardProblem>();
  const ordered = [...scenes].sort((left, right) => left.order - right.order);

  if (ordered.length > 0 && ordered[0]?.startSeconds !== 0) problems.add("timeline_start");

  ordered.forEach((scene, index) => {
    if (scene.endSeconds <= scene.startSeconds) problems.add("scene_duration");
    if (scene.order !== index + 1) problems.add("scene_order");
    if (scene.assetIds.length === 0) problems.add("asset_reference_missing");
    const hasVoiceOver = scene.voiceOver !== null || scene.caption !== null;
    if (settings.voiceOverEnabled && (scene.voiceOver === null || scene.caption === null)) problems.add("voice_over_missing");
    if (!settings.voiceOverEnabled && hasVoiceOver) problems.add("voice_over_unexpected");

    const previous = ordered[index - 1];
    if (previous && previous.endSeconds !== scene.startSeconds) problems.add("timeline_gap");
  });

  if (storyboardTotalDurationSeconds(ordered) !== settings.durationSeconds) problems.add("total_duration_mismatch");

  return [...problems];
}

/** A scene shorter than this is not readable on screen, so normalization never produces one. */
const MIN_SCENE_SECONDS = 0.5;

/**
 * Turns model output into a storyboard the renderer can actually consume. The model is asked for
 * contiguous timing, but it is not reliable about it, so this renumbers the scenes, rescales the
 * timeline to start at zero, abut, and sum to exactly the configured duration, points every scene
 * at a real asset, and mirrors the on-screen copy into the voice-over and caption tracks when
 * voice-over is on. It refuses to return a storyboard that still has a problem rather than handing
 * a broken timeline to a render.
 */
export function normalizeStoryboard(
  scenes: readonly StoryboardScene[],
  settings: VideoOutputSettings,
  assetIds: readonly string[],
): readonly StoryboardScene[] {
  if (scenes.length === 0) throw invalidStoryboard();

  const ordered = [...scenes].sort((left, right) => left.order - right.order);
  const durations = sceneDurations(ordered, settings.durationSeconds);
  let cursor = 0;

  const normalized = ordered.map((scene, index) => {
    const isLast = index === ordered.length - 1;
    const startSeconds = cursor;
    const endSeconds = isLast ? settings.durationSeconds : round(cursor + (durations[index] ?? 0));
    cursor = endSeconds;

    return {
      ...scene,
      order: index + 1,
      startSeconds,
      endSeconds,
      assetIds: scene.assetIds.length > 0 ? scene.assetIds : assetForScene(assetIds, index),
      voiceOver: settings.voiceOverEnabled ? (scene.voiceOver ?? scene.onScreenCopy) : null,
      caption: settings.voiceOverEnabled ? (scene.caption ?? scene.onScreenCopy) : null,
    };
  });

  if (findStoryboardProblems(normalized, settings).length > 0) throw invalidStoryboard();
  return normalized;
}

/**
 * Hands every scene the minimum readable share first, then splits what is left in proportion to the
 * model's own timings. A zero-length or absurdly short scene from the model comes back readable
 * instead of being dropped, and the shares always add up to the configured duration.
 */
function sceneDurations(scenes: readonly StoryboardScene[], durationSeconds: number): readonly number[] {
  const count = scenes.length;
  const minimum = count * MIN_SCENE_SECONDS <= durationSeconds ? MIN_SCENE_SECONDS : 0;
  const remaining = durationSeconds - minimum * count;
  const raw = scenes.map((scene) => scene.endSeconds - scene.startSeconds);
  const total = raw.reduce((sum, value) => sum + value, 0);
  const weights = total > 0 ? raw.map((value) => value / total) : raw.map(() => 1 / count);
  return weights.map((weight) => minimum + weight * remaining);
}

function assetForScene(assetIds: readonly string[], index: number): string[] {
  const assetId = assetIds[index % assetIds.length];
  return assetId === undefined ? [] : [assetId];
}

function invalidStoryboard(): VideoError {
  return new VideoError("video_input_invalid", "The storyboard does not fit the project settings.");
}
