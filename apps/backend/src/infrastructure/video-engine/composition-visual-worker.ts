import { readFile, writeFile } from "node:fs/promises";
import type { CaptureSession, FileServerHandle } from "@hyperframes/producer";
import * as producer from "@hyperframes/producer";
import type { VisualCheckIssue } from "./composition-visual-check";

type CaptureJob = {
  dir: string;
  workDir: string;
  resultPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  browserPath?: string;
  disableGpu: boolean;
  samples: { time: number; sceneId?: string; requireAll: boolean; boundary: boolean }[];
  geometryScript: string;
  fontScript: string;
};

const job: CaptureJob = JSON.parse(await readFile(process.argv[2]!, "utf8"));
const report: {
  fonts: unknown;
  samples: { time: number; geometry: unknown }[];
  issues: VisualCheckIssue[];
} = {
  fonts: [],
  samples: [],
  issues: [],
};
let server: FileServerHandle | undefined;
let session: CaptureSession | undefined;
let sampleTime = 0;
const runtimeIssue = (code: string, message: string) => report.issues.push({
  code, message, scene: "main", selector: "[data-composition-id=main]", time: sampleTime,
});

try {
  const fps = { num: job.fps, den: 1 };
  server = await producer.createFileServer({ projectDir: job.dir, fps });
  session = await producer.createCaptureSession(server.url, job.workDir, {
    width: job.width,
    height: job.height,
    fps,
    format: "png",
    compositionDurationSeconds: job.durationSeconds,
  }, null, {
    ...(job.browserPath ? { chromePath: job.browserPath } : {}),
    disableGpu: job.disableGpu,
    forceScreenshot: true,
    staticFrameDedup: false,
    enableBrowserPool: false,
    useDrawElement: false,
  });
  session.page.on("pageerror", (error) => runtimeIssue("runtime_error", error instanceof Error ? error.message : String(error)));
  session.page.on("requestfailed", (request) => {
    if (request.resourceType() === "media" && request.failure()?.errorText === "net::ERR_ABORTED") return;
    runtimeIssue("asset_request_failed", `${request.url()}: ${request.failure()?.errorText ?? "request failed"}`);
  });
  session.page.on("response", (response) => {
    if (response.status() >= 400) runtimeIssue("asset_http_failed", `${response.status()} ${response.url()}`);
  });
  await producer.initializeSession(session);
  report.fonts = await session.page.evaluate(job.fontScript);
  for (const sample of job.samples) {
    sampleTime = sample.time;
    await producer.captureFrameToBuffer(session, Math.round(sample.time * job.fps), sample.time);
    await session.page.evaluate(`window.__visualaGateSample = ${JSON.stringify(sample)}`);
    report.samples.push({ time: sample.time, geometry: await session.page.evaluate(job.geometryScript) });
  }
} catch (error) {
  runtimeIssue("visual_check_unreadable", error instanceof Error ? error.message : String(error));
} finally {
  try {
    if (session) await producer.closeCaptureSession(session);
  } finally {
    server?.close();
  }
}
await writeFile(job.resultPath, JSON.stringify(report));
