import { z } from "zod";
import { VideoError } from "./errors";

/** The PRD caps rerenders after the first successful render at three. */
export const MAX_RERENDERS_PER_PROJECT = 3;

/**
 * The PRD leaves the asset count, project byte ceiling, and dimension bounds TBD pending the
 * storage and vision benchmarks. These are the proposed MVP defaults; override per environment.
 */
const limitsSchema = z.object({
  VIDEO_MAX_ASSETS_PER_PROJECT: z.coerce.number().int().positive().default(8),
  VIDEO_MAX_PROJECT_ASSET_BYTES: z.coerce.number().int().positive().default(40 * 1024 * 1024),
  VIDEO_MIN_IMAGE_DIMENSION: z.coerce.number().int().positive().default(200),
  VIDEO_MAX_IMAGE_DIMENSION: z.coerce.number().int().positive().default(8000),
}).strict();

export type AssetLimits = {
  maxAssetsPerProject: number;
  maxProjectAssetBytes: number;
  minImageDimension: number;
  maxImageDimension: number;
};

export function readAssetLimits(environment: Readonly<Record<string, string | undefined>> = process.env): AssetLimits {
  const parsed = limitsSchema.safeParse(pick(environment));
  if (!parsed.success) throw new VideoError("video_input_invalid", "The asset limits are not configured correctly.");
  return {
    maxAssetsPerProject: parsed.data.VIDEO_MAX_ASSETS_PER_PROJECT,
    maxProjectAssetBytes: parsed.data.VIDEO_MAX_PROJECT_ASSET_BYTES,
    minImageDimension: parsed.data.VIDEO_MIN_IMAGE_DIMENSION,
    maxImageDimension: parsed.data.VIDEO_MAX_IMAGE_DIMENSION,
  };
}

function pick(environment: Readonly<Record<string, string | undefined>>) {
  return {
    VIDEO_MAX_ASSETS_PER_PROJECT: environment.VIDEO_MAX_ASSETS_PER_PROJECT,
    VIDEO_MAX_PROJECT_ASSET_BYTES: environment.VIDEO_MAX_PROJECT_ASSET_BYTES,
    VIDEO_MIN_IMAGE_DIMENSION: environment.VIDEO_MIN_IMAGE_DIMENSION,
    VIDEO_MAX_IMAGE_DIMENSION: environment.VIDEO_MAX_IMAGE_DIMENSION,
  };
}

/** Ceiling for one rendered MP4, matching the bucket's `file_size_limit`. */
export const MAX_RENDER_OUTPUT_BYTES = 524288000;

const renderLimitsSchema = z.object({
  VIDEO_MAX_RENDER_OUTPUT_BYTES: z.coerce.number().int().positive().default(MAX_RENDER_OUTPUT_BYTES),
}).strict();

export type RenderLimits = { maxOutputBytes: number };

export function readRenderLimits(environment: Readonly<Record<string, string | undefined>> = process.env): RenderLimits {
  const parsed = renderLimitsSchema.safeParse({ VIDEO_MAX_RENDER_OUTPUT_BYTES: environment.VIDEO_MAX_RENDER_OUTPUT_BYTES });
  if (!parsed.success) throw new VideoError("video_input_invalid", "The render limits are not configured correctly.");
  return { maxOutputBytes: parsed.data.VIDEO_MAX_RENDER_OUTPUT_BYTES };
}
