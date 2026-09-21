import { VideoError } from "./errors";
import type { VideoAspectRatio, VideoDurationSeconds, VideoResolution } from "./types";

export type RenderCombination = {
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  durationSeconds: VideoDurationSeconds;
};

/**
 * Combinations the HyperFrames spike rendered successfully.
 * Source: docs/decisions/2026-09-21-hyperframes-render-engine.md.
 * Remove any row the record lists under "combinations the MVP must not offer", together with its test row.
 */
export const RENDER_SUPPORTED_COMBINATIONS: readonly RenderCombination[] = [
  { aspectRatio: "9:16", resolution: "720p", durationSeconds: 6 },
  { aspectRatio: "9:16", resolution: "720p", durationSeconds: 10 },
  { aspectRatio: "9:16", resolution: "720p", durationSeconds: 15 },
  { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 6 },
  { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 10 },
  { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 15 },
  { aspectRatio: "1:1", resolution: "720p", durationSeconds: 6 },
  { aspectRatio: "1:1", resolution: "720p", durationSeconds: 10 },
  { aspectRatio: "1:1", resolution: "720p", durationSeconds: 15 },
  { aspectRatio: "1:1", resolution: "1080p", durationSeconds: 6 },
  { aspectRatio: "1:1", resolution: "1080p", durationSeconds: 10 },
  { aspectRatio: "1:1", resolution: "1080p", durationSeconds: 15 },
  { aspectRatio: "16:9", resolution: "720p", durationSeconds: 6 },
  { aspectRatio: "16:9", resolution: "720p", durationSeconds: 10 },
  { aspectRatio: "16:9", resolution: "720p", durationSeconds: 15 },
  { aspectRatio: "16:9", resolution: "1080p", durationSeconds: 6 },
  { aspectRatio: "16:9", resolution: "1080p", durationSeconds: 10 },
  { aspectRatio: "16:9", resolution: "1080p", durationSeconds: 15 },
];

export function isRenderCombinationSupported(combination: RenderCombination): boolean {
  return RENDER_SUPPORTED_COMBINATIONS.some(
    (supported) =>
      supported.aspectRatio === combination.aspectRatio &&
      supported.resolution === combination.resolution &&
      supported.durationSeconds === combination.durationSeconds,
  );
}

export function assertRenderCombinationSupported(combination: RenderCombination): void {
  if (!isRenderCombinationSupported(combination)) {
    throw new VideoError("video_input_invalid", "The video settings are not supported.");
  }
}
