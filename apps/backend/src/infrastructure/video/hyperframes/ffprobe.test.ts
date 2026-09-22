import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseProbe, probeVideo } from "./ffprobe";

const run = promisify(execFile);
const hasFfmpeg = await run("ffmpeg", ["-version"]).then(() => true).catch(() => false);

/**
 * The parser is pure, so it is pinned without a subprocess and without FFmpeg: a hand-written payload
 * is the only way to state a rational frame rate and an audio stream deterministically.
 */
describe("parseProbe", () => {
  it("parses an FFprobe payload with an audio stream and a rational frame rate", () => {
    // `r_frame_rate` is a rational like "30000/1001"; a naive Number() would read it as NaN. This
    // pins the parser against a hand-written payload, so the rational handling is tested even on a
    // machine where FFmpeg cannot encode with audio.
    const probe = parseProbe(JSON.stringify({
      streams: [
        { codec_type: "video", width: 1080, height: 1920, r_frame_rate: "30000/1001" },
        { codec_type: "audio" },
      ],
      format: { duration: "10.010", size: "1234" },
    }));

    expect(probe).toEqual({ durationSeconds: 10.01, width: 1080, height: 1920, frameRate: 29.97, hasAudio: true, byteSize: 1234 });
  });

  it("refuses a payload with no video stream rather than reporting a zero-sized frame", () => {
    expect(() => parseProbe(JSON.stringify({ streams: [{ codec_type: "audio" }], format: { duration: "1", size: "1" } }))).toThrowError();
  });
});

describe.skipIf(!hasFfmpeg)("probeVideo", () => {
  it("reads the duration, the frame size, and the absence of an audio stream", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hf-probe-"));
    const file = join(dir, "sample.mp4");
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=30", "-t", "2", "-pix_fmt", "yuv420p", file]);

    const probe = await probeVideo(file);

    expect(probe.durationSeconds).toBeGreaterThan(1.9);
    expect(probe.durationSeconds).toBeLessThan(2.1);
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
    expect(probe.frameRate).toBe(30);
    expect(probe.hasAudio).toBe(false);
    expect(probe.byteSize).toBeGreaterThan(0);
  });

  it("reports the failure rather than a zero-length video for a file it cannot read", async () => {
    await expect(probeVideo("/nonexistent/never.mp4")).rejects.toMatchObject({ code: "render_output_invalid" });
  });
});
