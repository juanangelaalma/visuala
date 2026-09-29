import { z } from "zod";
import { frameDimensions } from "../video/settings";
import type { VideoProject } from "../video/types";

/**
 * What a render needs, frozen when the job is queued. The worker reads this instead of the project row, so
 * a settings change between queueing and rendering cannot silently change the frame that was planned.
 */
export const renderInputSnapshotSchema = z
  .object({
    compositionHash: z.string().regex(/^[0-9a-f]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    durationSeconds: z.number().int().positive(),
    aspectRatio: z.string().trim().min(1),
    resolution: z.string().trim().min(1),
  })
  .strict();

export type RenderInputSnapshot = z.infer<typeof renderInputSnapshotSchema>;

export function renderInputSnapshotFor(input: { project: VideoProject; compositionHash: string; fps: number }): RenderInputSnapshot {
  const frame = frameDimensions(input.project.settings);
  return {
    compositionHash: input.compositionHash,
    width: frame.width,
    height: frame.height,
    fps: input.fps,
    durationSeconds: input.project.settings.durationSeconds,
    aspectRatio: input.project.settings.aspectRatio,
    resolution: input.project.settings.resolution,
  };
}
