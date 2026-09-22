import type { RenderManifest } from "./render-manifest";

export type RenderEngineRequest = {
  /** The frozen input. The engine renders exactly this and nothing else. */
  manifest: RenderManifest;
  /** A directory the engine owns for the duration of the render. */
  workDir: string;
  /** Where the encoded file must land. The engine creates the parent directory if needed. */
  outputPath: string;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
};

/** What the engine read back from the encoder, not what it was asked for. */
export type RenderProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  /** Frames per second, parsed from FFprobe's `r_frame_rate` rational. */
  frameRate: number;
  /** False for every render this pipeline produces today: no audio source is wired up yet. */
  hasAudio: boolean;
  byteSize: number;
};

export type RenderEngineResult = {
  outputPath: string;
  /** The fingerprint of the manifest that produced this file, as written on the version row. */
  manifestHash: string;
  probe: RenderProbe;
};

/**
 * The render boundary the PRD asks for. A local HyperFrames process and a cloud render service both
 * satisfy this, so moving the worker off the host changes no domain or application code.
 */
export interface RenderEngine {
  render(request: RenderEngineRequest): Promise<RenderEngineResult>;
}
