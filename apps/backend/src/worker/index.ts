import { isReclaimDue, nextQueuedRenderJobId, reclaimIntervalMs, reclaimStaleRenderJobs, runRenderJob } from "@/application/video-engine/render-worker";
import { createRenderWorkerServices } from "@/application/video/services";
import { readRenderWorkerConfig } from "@/infrastructure/video-engine/render-worker-config";

/**
 * The render worker. A separate process from the HTTP server on purpose: the PRD requires a job boundary,
 * and a long render must not hold a request open. It listens on nothing.
 */
const config = readRenderWorkerConfig();

let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

const dependencies = createRenderWorkerServices(process.env);

console.log(`Render worker started (poll ${config.pollMs}ms, timeout ${config.jobTimeoutMs}ms).`);

// Reclaim before the first claim: a job abandoned by a previous process is otherwise invisible until the
// staleness window expires, and its project stays in `rendering` until it is reclaimed.
const reclaimEveryMs = reclaimIntervalMs({ pollMs: config.pollMs, staleJobMs: config.staleJobMs });
let lastReclaimAt = Date.now();
const reclaimedOnStart = await reclaimStaleRenderJobs(dependencies, { startedBefore: staleBefore(), limit: config.concurrency });
if (reclaimedOnStart > 0) console.log(`Reclaimed ${reclaimedOnStart} abandoned render job(s).`);

while (!stopping) {
  try {
    if (isReclaimDue(Date.now(), lastReclaimAt, reclaimEveryMs)) {
      lastReclaimAt = Date.now();
      const reclaimed = await reclaimStaleRenderJobs(dependencies, { startedBefore: staleBefore(), limit: config.concurrency });
      if (reclaimed > 0) console.log(`Reclaimed ${reclaimed} abandoned render job(s).`);
    }

    const jobId = await nextQueuedRenderJobId(dependencies.jobs);
    if (jobId === null) {
      await sleep(config.pollMs);
      continue;
    }

    const outcome = await runRenderJob(jobId, dependencies);
    console.log(`Render job ${jobId}: ${outcome.outcome}${outcome.outcome === "failed" ? ` (${outcome.errorCode})` : ""}.`);
  } catch (error) {
    // The loop must survive an unexpected failure, or one bad job stops every later render.
    console.error("Render worker iteration failed.", error);
    await sleep(config.pollMs);
  }
}

console.log("Render worker stopping.");

function staleBefore(): string {
  return new Date(Date.now() - config.staleJobMs).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
