import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RenderError } from "../../../domain/video/errors";
import type { RenderProbe } from "../../../domain/video/render-engine";

const run = promisify(execFile);

type FfprobeStream = { codec_type?: string; width?: number; height?: number; r_frame_rate?: string };
type FfprobePayload = { streams?: FfprobeStream[]; format?: { duration?: string; size?: string } };

/**
 * Reads the real properties of the encoded file. Verification lives here rather than on the version
 * row, because the PRD's automated checks are about the file that was actually produced: a file that
 * cannot be decoded, or whose duration or frame size drifted, must not become a published version.
 */
export async function probeVideo(filePath: string, ffmpegPath: string | null = null): Promise<RenderProbe> {
  let stdout: string;
  try {
    const result = await run(ffmpegPath ? ffprobeFromFfmpeg(ffmpegPath) : "ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size:stream=codec_type,width,height,r_frame_rate",
      "-of", "json",
      filePath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    stdout = result.stdout;
  } catch {
    throw invalidOutput();
  }
  return parseProbe(stdout);
}

/**
 * A configured `ffmpeg` path implies its sibling `ffprobe`, so one pinned path covers both binaries.
 * A bare command name has no directory, and the sibling is then just `ffprobe` on the same PATH.
 */
export function ffprobeFromFfmpeg(ffmpegPath: string): string {
  const separator = Math.max(ffmpegPath.lastIndexOf("/"), ffmpegPath.lastIndexOf("\\"));
  const directory = separator === -1 ? "" : ffmpegPath.slice(0, separator + 1);
  return `${directory}${ffmpegPath.slice(separator + 1).replace("ffmpeg", "ffprobe")}`;
}

/**
 * Reads the probe payload. A missing video stream, or a duration or frame rate that is not a number,
 * is a refusal: reporting a zero-sized frame would let a broken encode become a published version.
 */
export function parseProbe(stdout: string): RenderProbe {
  const payload = parseJson(stdout);
  const streams = payload.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video || typeof video.width !== "number" || typeof video.height !== "number") throw invalidOutput();

  const durationSeconds = Number(payload.format?.duration);
  const byteSize = Number(payload.format?.size);
  const frameRate = parseFrameRate(video.r_frame_rate);
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(byteSize) || frameRate === null) throw invalidOutput();

  return {
    durationSeconds,
    width: video.width,
    height: video.height,
    frameRate,
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    byteSize,
  };
}

/** `r_frame_rate` is a rational (`"30000/1001"`), so a plain `Number()` would read it as `NaN`. */
function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [numerator, denominator] = value.split("/");
  const top = Number(numerator);
  const bottom = denominator === undefined ? 1 : Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) return null;
  return Math.round((top / bottom) * 100) / 100;
}

function parseJson(stdout: string): FfprobePayload {
  try {
    return JSON.parse(stdout) as FfprobePayload;
  } catch {
    throw invalidOutput();
  }
}

function invalidOutput(): RenderError {
  return new RenderError("render_output_invalid", "The rendered file could not be read.");
}
