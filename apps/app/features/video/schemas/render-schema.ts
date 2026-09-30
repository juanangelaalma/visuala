import { z } from "zod";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from "@/domain/video/settings";
import type { VideoRenderJob, VideoVersion } from "@/domain/video/types";

const renderJobStatusSchema = z.enum(["queued", "preparing", "rendering", "uploading", "succeeded", "failed", "cancelled"]);
const outputKindSchema = z.enum(["preview", "final"]);

/** Mirrors the backend's `RenderJobResponse`. Optional because the backend omits a field until it has a value. */
export const videoRenderJobSchema = z.object({
  id: z.string(),
  kind: outputKindSchema,
  status: renderJobStatusSchema,
  isRevision: z.boolean(),
  attempts: z.number().int(),
  queuedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  errorCode: z.string().optional(),
});

export const videoRenderJobResponseSchema = z.object({ job: videoRenderJobSchema.nullable() });

/**
 * Mirrors the backend's `VersionResponse`. `kind` matters to the UI: only a `final` version is a
 * deliverable, and a `preview` is what the user watches before approving.
 */
export const videoVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  kind: outputKindSchema,
  // A whole number of seconds, inside the range the project may ask for.
  durationSeconds: z.number().int().positive(),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  createdAt: z.string(),
  playbackUrl: z.string().nullable(),
});

export const videoVersionListSchema = z.object({ versions: z.array(videoVersionSchema) });

export type RenderStatus = { job: VideoRenderJob | null; versions: VideoVersion[] };
