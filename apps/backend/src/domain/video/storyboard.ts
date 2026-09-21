import { z } from "zod";
import type { VideoOutputSettings } from "./types";

export const STORYBOARD_SCHEMA_NAME = "video_storyboard";
export const STORYBOARD_SCHEMA_VERSION = "v1";

/** Design-system safe-area limits for on-screen text at the smallest supported resolution. */
export const MAX_SCENE_TITLE_CHARS = 40;
export const MAX_SCENE_COPY_CHARS = 90;

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
  transition: z.enum(["cut", "fade", "slide", "zoom"]),
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
