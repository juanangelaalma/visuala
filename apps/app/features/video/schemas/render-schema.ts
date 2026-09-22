import { z } from "zod";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from "@/domain/video/settings";
import type { VideoRenderJob, VideoVersion } from "@/domain/video/types";

const renderJobStatusSchema = z.enum(["queued", "preparing", "rendering", "uploading", "succeeded", "failed", "cancelled"]);

/** Mirrors the backend's `RenderJobResponse`. Optional because the backend omits a field until it has a value. */
export const videoRenderJobSchema = z.object({
  id: z.string(),
  status: renderJobStatusSchema,
  isRevision: z.boolean(),
  attempts: z.number().int(),
  queuedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string(),
});

export const videoRenderJobListSchema = z.object({ jobs: z.array(videoRenderJobSchema) });

/** Mirrors the backend's `VersionResponse`. A null URL is a version whose object is gone. */
export const videoVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  // The landed version's probed duration is rounded to whole seconds, and the API only accepts 6, 10,
  // and 15, so a value outside this set means the backend published something the app cannot label.
  durationSeconds: z.union([z.literal(6), z.literal(10), z.literal(15)]),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  createdAt: z.string(),
  playbackUrl: z.string().nullable(),
});

export const videoVersionListSchema = z.object({ versions: z.array(videoVersionSchema) });

export type RenderStatus = { jobs: VideoRenderJob[]; versions: VideoVersion[] };
