import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { z } from "zod";

const require = createRequire(import.meta.url);

const ffprobe = z.object({ path: z.string() }).parse(require("ffprobe-static"));

export async function withCompositionProject<T>(html: string, useProject: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "visuala-fnb-"));

  try {
    await writeFile(join(directory, "index.html"), html);

    return await useProject(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runHyperframes(directory: string, arguments_: string[], timeout: number): Promise<string> {
  const packagePath = require.resolve("hyperframes/package.json");
  const packageData = z.object({ bin: z.object({ hyperframes: z.string() }) }).parse(JSON.parse(await readFile(packagePath, "utf8")));
  const binary = packageData.bin.hyperframes;
  const executable = join(dirname(packagePath), binary);
  const path = ffmpegPath ? `${dirname(ffmpegPath)}:${process.env.PATH ?? ""}` : process.env.PATH;

  return new Promise<string>((resolve, reject) => {
    const child = spawn("node", [executable, ...arguments_, directory], {
      cwd: directory,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: path,
        HYPERFRAMES_BROWSER_PATH: process.env.HYPERFRAMES_BROWSER_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH,
        HYPERFRAMES_FFMPEG_PATH: process.env.HYPERFRAMES_FFMPEG_PATH ?? ffmpegPath ?? undefined,
        HYPERFRAMES_FFPROBE_PATH: process.env.HYPERFRAMES_FFPROBE_PATH ?? ffprobe.path,
        HYPERFRAMES_TELEMETRY_DISABLED: "1",
      },
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure: Error | undefined;

    const terminate = () => {
      if (!child.pid) return;

      if (process.platform === "win32") child.kill("SIGTERM");
      else {
        try { process.kill(-child.pid, "SIGTERM"); }
        catch { if (!child.killed) child.kill("SIGTERM"); }
      }
    };

    const deadline = setTimeout(() => {
      failure = new Error(`Hyperframes ${arguments_[0]} exceeded its ${timeout}ms deadline.`);
      terminate();
    }, timeout);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;

      if (stdoutBytes > 16 * 1024 * 1024) {
        failure = new Error("Hyperframes output exceeded 16 MiB.");
        terminate();
      } else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;

      if (stderrBytes > 16 * 1024 * 1024) {
        failure = new Error("Hyperframes diagnostic output exceeded 16 MiB.");
        terminate();
      } else stderr.push(chunk);
    });
    child.on("error", (error) => { clearTimeout(deadline); reject(error); });
    // `close`, unlike `exit`, waits for both output streams to drain.
    child.on("close", (code, signal) => {
      clearTimeout(deadline);

      if (failure) {
        reject(failure);

        return;
      }

      const output = Buffer.concat(stdout).toString("utf8");
      const diagnostic = Buffer.concat(stderr).toString("utf8");

      if ((code === 0 || (arguments_[0] === "check" && code === 1)) && output.trim()) {
        resolve(output);
      } else {
        reject(new Error(`Hyperframes ${arguments_[0]} exited with code ${code}, signal ${signal ?? "none"}${output ? "" : ", without output"}. ${diagnostic.slice(-1500)}`));
      }
    });
  });
}

export async function renderComposition(html: string): Promise<Uint8Array> {
  return withCompositionProject(html, async (directory) => {
    const output = join(directory, "output.mp4");
    await runHyperframes(directory, ["render", "--quality", "delivery", "--fps", "30", "--workers", "1", "--strict", "--output", output], 20 * 60_000);
    const bytes = await readFile(output);

    if (bytes.byteLength < 32 || bytes.toString("ascii", 4, 8) !== "ftyp") throw new Error("Renderer did not produce an MP4.");

    return bytes;
  });
}
