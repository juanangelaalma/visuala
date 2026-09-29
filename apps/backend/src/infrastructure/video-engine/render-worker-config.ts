import { z } from "zod";
import { VideoError } from "../../domain/video/errors";
import { MAX_RENDER_OUTPUT_BYTES } from "../../domain/video/limits";
import type { HyperFramesEngineOptions } from "./hyperframes-render-engine";

const booleanish = z.enum(["true", "false"]).transform((value) => value === "true");

/**
 * The worker's operational knobs. `RENDER_FPS` is gone: the rate is part of a composition, not a host
 * setting, and the frame the job was planned at is frozen into the job's own input snapshot.
 */
const schema = z.object({
  RENDER_WORKER_POLL_MS: z.coerce.number().int().min(50).default(2000),
  RENDER_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  RENDER_JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).default(600_000),
  RENDER_STALE_JOB_MS: z.coerce.number().int().min(1000).default(900_000),
  RENDER_WORK_DIR: z.string().trim().min(1).nullable().default(null),
  HYPERFRAMES_BROWSER_PATH: z.string().trim().min(1).nullable().default(null),
  HYPERFRAMES_FFMPEG_PATH: z.string().trim().min(1).nullable().default(null),
  HYPERFRAMES_EXTRACT_CACHE_DIR: z.string().trim().min(1).nullable().default(null),
  PRODUCER_LOW_MEMORY_MODE: booleanish.default(false),
  PRODUCER_MAX_WORKERS: z.coerce.number().int().min(1).max(24).default(1),
  PRODUCER_DISABLE_GPU: booleanish.default(true),
  VIDEO_MAX_RENDER_OUTPUT_BYTES: z.coerce.number().int().positive().default(MAX_RENDER_OUTPUT_BYTES),
}).strict();

export type RenderWorkerConfig = {
  pollMs: number;
  concurrency: number;
  jobTimeoutMs: number;
  staleJobMs: number;
  workRoot: string | null;
  maxOutputBytes: number;
  engine: HyperFramesEngineOptions;
};

export function readRenderWorkerConfig(environment: Readonly<Record<string, string | undefined>> = process.env): RenderWorkerConfig {
  const parsed = schema.safeParse(pick(environment));
  if (!parsed.success) throw invalidConfig();

  // A reclaimer quicker than the render timeout would fail jobs that are still running, which a user
  // cannot tell apart from a render that vanished.
  if (parsed.data.RENDER_STALE_JOB_MS <= parsed.data.RENDER_JOB_TIMEOUT_MS) throw invalidConfig();

  return {
    pollMs: parsed.data.RENDER_WORKER_POLL_MS,
    concurrency: parsed.data.RENDER_WORKER_CONCURRENCY,
    jobTimeoutMs: parsed.data.RENDER_JOB_TIMEOUT_MS,
    staleJobMs: parsed.data.RENDER_STALE_JOB_MS,
    workRoot: parsed.data.RENDER_WORK_DIR,
    maxOutputBytes: parsed.data.VIDEO_MAX_RENDER_OUTPUT_BYTES,
    engine: {
      maxOutputBytes: parsed.data.VIDEO_MAX_RENDER_OUTPUT_BYTES,
      maxWorkers: parsed.data.PRODUCER_MAX_WORKERS,
      lowMemoryMode: parsed.data.PRODUCER_LOW_MEMORY_MODE,
      disableGpu: parsed.data.PRODUCER_DISABLE_GPU,
      browserPath: parsed.data.HYPERFRAMES_BROWSER_PATH,
      ffmpegPath: parsed.data.HYPERFRAMES_FFMPEG_PATH,
      extractCacheDir: parsed.data.HYPERFRAMES_EXTRACT_CACHE_DIR,
    },
  };
}

function pick(environment: Readonly<Record<string, string | undefined>>) {
  return Object.fromEntries(Object.keys(schema.shape).map((key) => [key, environment[key]]));
}

function invalidConfig(): VideoError {
  return new VideoError("video_input_invalid", "The render worker is not configured correctly.");
}
