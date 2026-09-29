export type RenderProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  hasAudio: boolean;
  byteSize: number;
};

export type RenderCompositionRequest = {
  /** Directory holding the frozen artifact: `index.html`, its assets, fonts, and `vendor/gsap.min.js`. */
  artifactDir: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  quality: "draft" | "standard" | "high";
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
};

export type RenderCompositionResult = { outputPath: string; probe: RenderProbe };

/** The render boundary: a local HyperFrames process and a cloud service both satisfy it. The engine reads only the artifact directory it is handed. */
export interface RenderCompositionEngine {
  render(request: RenderCompositionRequest): Promise<RenderCompositionResult>;
}
