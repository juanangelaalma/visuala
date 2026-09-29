import type * as HyperFramesProducer from "@hyperframes/producer";
import { RenderFailure } from "../../domain/video-engine/errors";
import { probeVideo } from "./ffprobe";
import type { RenderCompositionEngine, RenderCompositionRequest, RenderCompositionResult, RenderProbe } from "../../domain/video-engine/render-engine";

/** One output frame of tolerance: FFmpeg's duration is a stream property, not an exact frame count. */
const DURATION_TOLERANCE_SECONDS = 1 / 24;

/** FFprobe reports a rational rate, so a 29.97 encode must not be rejected for a 30 fps composition. */
const FRAME_RATE_TOLERANCE = 0.5;

export type HyperFramesEngineOptions = {
  maxOutputBytes: number;
  maxWorkers: number;
  lowMemoryMode: boolean;
  disableGpu: boolean;
  browserPath?: string | null;
  ffmpegPath?: string | null;
  extractCacheDir?: string | null;
  probe?: (path: string, ffmpegPath: string | null) => Promise<RenderProbe>;
  executeRender?: typeof HyperFramesProducer.executeRenderJob;
};

/** Renders a frozen artifact with the local producer. The probe is the real gate: the file must still match the declared size, duration, and rate. */
export class HyperFramesRenderEngine implements RenderCompositionEngine {
  private producer: typeof HyperFramesProducer | null = null;

  constructor(private readonly options: HyperFramesEngineOptions) {}

  async render(request: RenderCompositionRequest): Promise<RenderCompositionResult> {
    this.applyProducerEnvironment();
    const producer = await this.loadProducer();

    const job = producer.createRenderJob({
      fps: request.fps,
      quality: request.quality,
      format: "mp4",
      entryFile: "index.html",
      strictness: "best-effort",
    });

    try {
      await (this.options.executeRender ?? producer.executeRenderJob)(
        job,
        request.artifactDir,
        request.outputPath,
        request.onProgress === undefined ? undefined : (current) => request.onProgress?.(current.progress),
        request.signal,
      );
    } catch (error) {
      throw failure(error, producer.RenderCancelledError);
    }

    const probe = await (this.options.probe ?? probeVideo)(request.outputPath, this.options.ffmpegPath ?? null);
    this.assertProbeMatches(request, probe);

    return { outputPath: request.outputPath, probe };
  }

  private async loadProducer(): Promise<typeof HyperFramesProducer> {
    this.producer ??= await import("@hyperframes/producer");
    return this.producer;
  }

  /** The CLI's documented knobs. Never let a render reach the network for telemetry or an update. */
  private applyProducerEnvironment(): void {
    const { options } = this;
    process.env.PRODUCER_MAX_WORKERS = String(options.maxWorkers);
    process.env.PRODUCER_LOW_MEMORY_MODE = String(options.lowMemoryMode);
    process.env.PRODUCER_DISABLE_GPU = String(options.disableGpu);
    process.env.HYPERFRAMES_NO_TELEMETRY = "1";
    process.env.HYPERFRAMES_NO_UPDATE_CHECK = "1";
    if (options.browserPath) process.env.HYPERFRAMES_BROWSER_PATH = options.browserPath;
    if (options.ffmpegPath) process.env.HYPERFRAMES_FFMPEG_PATH = options.ffmpegPath;
    if (options.extractCacheDir) process.env.HYPERFRAMES_EXTRACT_CACHE_DIR = options.extractCacheDir;
  }

  private assertProbeMatches(request: RenderCompositionRequest, probe: RenderProbe): void {
    if (probe.width !== request.width || probe.height !== request.height) {
      throw new RenderFailure("render_output_invalid", "The rendered file is not the size the composition asked for.");
    }
    if (Math.abs(probe.durationSeconds - request.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
      throw new RenderFailure("render_output_invalid", "The rendered file is not the duration the composition asked for.");
    }
    if (Math.abs(probe.frameRate - request.fps) > FRAME_RATE_TOLERANCE) {
      throw new RenderFailure("render_output_invalid", "The rendered file is not the frame rate the composition asked for.");
    }
    if (probe.byteSize <= 0) throw new RenderFailure("render_output_invalid", "The rendered file is empty.");
    if (probe.byteSize > this.options.maxOutputBytes) {
      throw new RenderFailure("render_output_too_large", "The rendered file is larger than this project can store.");
    }
  }
}

function failure(error: unknown, RenderCancelledError: typeof HyperFramesProducer.RenderCancelledError): RenderFailure {
  if (error instanceof RenderCancelledError) return new RenderFailure("render_engine_failed", "The render was interrupted.");
  return new RenderFailure("render_engine_failed", "The render engine could not produce a video.");
}
