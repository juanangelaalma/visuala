import { claimNextRenderJob, isReclaimDue, reclaimStaleRenderJobs, runRenderJob } from "@/application/video/render-worker";
import { createRenderWorkerServices } from "@/application/video/services";
import { readRenderWorkerConfig } from "@/domain/video/render-config";

/**
 * The render worker. A separate process from the HTTP server on purpose: the PRD requires a job
 * boundary, and a long render must not hold a request open. It listens on nothing.
 */
const config = readRenderWorkerConfig();

let stopping = false;
// Aborted on a stop signal so an in-flight render unwinds through HyperFrames' own cancellation path
// and leaves no Chrome or FFmpeg behind, rather than being killed mid-encode.
const shutdown = new AbortController();

process.on("SIGINT", () => { stopping = true; shutdown.abort(); });
process.on("SIGTERM", () => { stopping = true; shutdown.abort(); });

const dependencies = createRenderWorkerServices(process.env, shutdown.signal);

console.log(`Render worker started (poll ${config.pollMs}ms, timeout ${config.jobTimeoutMs}ms).`);

// Reclaim before the first claim: a job abandoned by a previous process is otherwise invisible until
// the staleness window expires, and its project is stuck in `rendering` until it is reclaimed.
let lastReclaimAt = Date.now();
const reclaimed = await reclaimStaleRenderJobs(dependencies);
if (reclaimed > 0) console.log(`Reclaimed ${reclaimed} abandoned render job(s).`);

// And keep reclaiming, so a replica that stays up can still rescue a peer's abandoned job. Half the
// staleness window means an abandoned job is picked up within about one and a half windows.
const reclaimEveryMs = Math.max(config.pollMs, Math.floor(config.staleJobMs / 2));

while (!stopping) {
  try {
    if (isReclaimDue(Date.now(), lastReclaimAt, reclaimEveryMs)) {
      lastReclaimAt = Date.now();
      const reclaimedNow = await reclaimStaleRenderJobs(dependencies);
      if (reclaimedNow > 0) console.log(`Reclaimed ${reclaimedNow} abandoned render job(s).`);
    }

    const jobId = await claimNextRenderJob(dependencies);
    if (jobId === null) {
      await sleep(config.pollMs);
      continue;
    }

    const outcome = await runRenderJob(jobId, dependencies);
    console.log(`Render job ${outcome.jobId}: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ""}.`);
  } catch (error) {
    // The loop must survive an unexpected failure, or one bad job stops every later render.
    console.error("Render worker iteration failed.", error);
    await sleep(config.pollMs);
  }
}

console.log("Render worker stopping.");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
