import { describe, expect, it } from "vitest";
import { readRenderWorkerConfig } from "./render-config";

describe("readRenderWorkerConfig", () => {
  it("defaults to one worker, a 30 fps render, and the PRD's ten-minute processing budget", () => {
    const config = readRenderWorkerConfig({});
    expect(config).toMatchObject({ fps: 30, quality: "standard", pollMs: 2000, concurrency: 1, jobTimeoutMs: 600_000, staleJobMs: 900_000, lowMemoryMode: false, maxWorkers: 1, disableGpu: true, browserPath: null, ffmpegPath: null, workRoot: null });
  });

  it("reads every override", () => {
    const config = readRenderWorkerConfig({
      RENDER_FPS: "24", RENDER_QUALITY: "high", RENDER_WORKER_POLL_MS: "500", RENDER_WORKER_CONCURRENCY: "2",
      RENDER_JOB_TIMEOUT_MS: "1000", RENDER_STALE_JOB_MS: "2000", RENDER_WORK_DIR: "/tmp/x",
      HYPERFRAMES_BROWSER_PATH: "/usr/bin/google-chrome", HYPERFRAMES_FFMPEG_PATH: "/usr/bin/ffmpeg",
      HYPERFRAMES_EXTRACT_CACHE_DIR: "/tmp/c", PRODUCER_LOW_MEMORY_MODE: "true", PRODUCER_MAX_WORKERS: "3",
      PRODUCER_DISABLE_GPU: "false", VIDEO_MAX_RENDER_OUTPUT_BYTES: "1024",
    });
    expect(config).toMatchObject({ fps: 24, quality: "high", pollMs: 500, concurrency: 2, jobTimeoutMs: 1000, staleJobMs: 2000, workRoot: "/tmp/x", browserPath: "/usr/bin/google-chrome", ffmpegPath: "/usr/bin/ffmpeg", extractCacheDir: "/tmp/c", lowMemoryMode: true, maxWorkers: 3, disableGpu: false, maxOutputBytes: 1024 });
  });

  it("refuses a configuration that would let a stale job outlive its own timeout", () => {
    expect(() => readRenderWorkerConfig({ RENDER_JOB_TIMEOUT_MS: "10000", RENDER_STALE_JOB_MS: "1000" })).toThrowError();
  });

  it("refuses a non-numeric value rather than silently defaulting", () => {
    expect(() => readRenderWorkerConfig({ RENDER_WORKER_CONCURRENCY: "many" })).toThrowError();
  });
});
