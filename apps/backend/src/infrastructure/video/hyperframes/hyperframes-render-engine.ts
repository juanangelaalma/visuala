import type * as HyperFramesProducer from "@hyperframes/producer";
import { renderManifestFingerprint } from "../../../domain/video/render-manifest";
import { RenderError } from "../../../domain/video/errors";
import { writeComposition } from "./composition-writer";
import { probeVideo } from "./ffprobe";
import type { AssetObjectStore } from "../../../domain/ai-service/assets";
import type { RenderEngine, RenderEngineRequest, RenderEngineResult, RenderProbe } from "../../../domain/video/render-engine";
import type { RenderWorkerConfig } from "../../../domain/video/render-config";

/** One output frame of tolerance: FFmpeg's duration is a stream property, not an exact frame count. */
const DURATION_TOLERANCE_SECONDS = 1 / 24;

/** FFprobe reports a rational rate, so a 29.97 encode must not be rejected for a 30 fps manifest. */
const FRAME_RATE_TOLERANCE = 0.5;

export type HyperFramesRenderEngineOptions = {
  config: Pick<RenderWorkerConfig, "fps" | "quality" | "maxOutputBytes" | "browserPath" | "ffmpegPath" | "extractCacheDir" | "lowMemoryMode" | "maxWorkers" | "disableGpu">;
  objectStore: Pick<AssetObjectStore, "read">;
  gsapScriptPath: string;
  probe?: (path: string, ffmpegPath: string | null) => Promise<RenderProbe>;
  executeRender?: typeof HyperFramesProducer.executeRenderJob;
  /** Injected only by unit tests, which must not write to the filesystem. */
  writeComposition?: typeof writeComposition;
};

export class HyperFramesRenderEngine implements RenderEngine {
  private producer: typeof HyperFramesProducer | null = null;

  constructor(private readonly options: HyperFramesRenderEngineOptions) {}

  async render(request: RenderEngineRequest): Promise<RenderEngineResult> {
    const manifestHash = renderManifestFingerprint(request.manifest);

    await (this.options.writeComposition ?? writeComposition)(request.manifest, request.workDir, {
      objectStore: this.options.objectStore,
      gsapScriptPath: this.options.gsapScriptPath,
    });

    this.applyProducerEnvironment();

    const producer = await this.loadProducer();
    const job = producer.createRenderJob({
      fps: request.manifest.fps,
      quality: this.options.config.quality,
      format: "mp4",
      entryFile: "index.html",
      // Best-effort renders a file with capture warnings; strict would refuse one over a single
      // unready frame. The probe below is this pipeline's real gate, so a warning is not fatal here.
      strictness: "best-effort",
    });

    try {
      await (this.options.executeRender ?? producer.executeRenderJob)(
        job,
        request.workDir,
        request.outputPath,
        request.onProgress === undefined ? undefined : (current) => request.onProgress?.(current.progress),
        request.signal,
      );
    } catch (error) {
      throw engineFailure(error, producer.RenderCancelledError);
    }

    const probe = await (this.options.probe ?? probeVideo)(request.outputPath, this.options.config.ffmpegPath);
    this.assertProbeMatches(request, probe);

    return { outputPath: request.outputPath, manifestHash, probe };
  }

  private async loadProducer(): Promise<typeof HyperFramesProducer> {
    this.producer ??= await import("@hyperframes/producer");
    return this.producer;
  }

  /** Set on this process before every render: the CLI's documented knobs, read only when no config object is passed. */
  private applyProducerEnvironment(): void {
    const { config } = this.options;
    process.env.PRODUCER_MAX_WORKERS = String(config.maxWorkers);
    process.env.PRODUCER_LOW_MEMORY_MODE = String(config.lowMemoryMode);
    process.env.PRODUCER_DISABLE_GPU = String(config.disableGpu);
    // Never let a render reach the network for an update check or telemetry.
    process.env.HYPERFRAMES_NO_TELEMETRY = "1";
    process.env.HYPERFRAMES_NO_UPDATE_CHECK = "1";
    if (config.browserPath) process.env.HYPERFRAMES_BROWSER_PATH = config.browserPath;
    if (config.ffmpegPath) process.env.HYPERFRAMES_FFMPEG_PATH = config.ffmpegPath;
    if (config.extractCacheDir) process.env.HYPERFRAMES_EXTRACT_CACHE_DIR = config.extractCacheDir;
  }

  private assertProbeMatches(request: RenderEngineRequest, probe: RenderProbe): void {
    const { manifest } = request;
    if (probe.width !== manifest.width || probe.height !== manifest.height) {
      throw new RenderError("render_output_invalid", "The rendered file is not the size the project asked for.");
    }
    if (Math.abs(probe.durationSeconds - manifest.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
      throw new RenderError("render_output_invalid", "The rendered file is not the duration the project asked for.");
    }
    if (Math.abs(probe.frameRate - manifest.fps) > FRAME_RATE_TOLERANCE) {
      throw new RenderError("render_output_invalid", "The rendered file is not the frame rate the project asked for.");
    }
    if (probe.byteSize <= 0) throw new RenderError("render_output_invalid", "The rendered file is empty.");
    if (probe.byteSize > this.options.config.maxOutputBytes) {
      throw new RenderError("render_output_too_large", "The rendered file is larger than this project can store.");
    }
  }
}

function engineFailure(error: unknown, RenderCancelledError: typeof HyperFramesProducer.RenderCancelledError): RenderError {
  if (error instanceof RenderCancelledError) {
    // Cancellation is the worker's own abort (a timeout or a shutdown) and is retryable by construction.
    return new RenderError("render_engine_failed", "The render was interrupted.");
  }
  return new RenderError("render_engine_failed", "The render engine could not produce a video.");
}
