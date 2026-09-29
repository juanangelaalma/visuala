import type { RenderJobRepository } from "../../domain/video-engine/contracts";
import { reclaimStaleJob, runRenderJob, type RenderJobDependencies, type RenderJobOutcome } from "./render-job";

/** True when the reclaimer's next turn has come. Half the staleness window means a peer's abandoned job is picked up within about one and a half windows. */
export function isReclaimDue(now: number, lastReclaimAt: number, everyMs: number): boolean {
  return now - lastReclaimAt >= everyMs;
}

export function reclaimIntervalMs(input: { pollMs: number; staleJobMs: number }): number {
  return Math.max(input.pollMs, Math.floor(input.staleJobMs / 2));
}

/** The oldest queued job, or null. `begin` inside `runRenderJob` is the real claim, so a race is harmless here. */
export async function nextQueuedRenderJobId(jobs: Pick<RenderJobRepository, "listQueued">): Promise<string | null> {
  const queued = await jobs.listQueued(1);
  return queued[0]?.id ?? null;
}

/** Fails every job a dead worker left behind, so its project is not stuck in `rendering` forever. */
export async function reclaimStaleRenderJobs(
  dependencies: Pick<RenderJobDependencies, "jobs" | "events">,
  input: { startedBefore: string; limit: number },
): Promise<number> {
  const stale = await dependencies.jobs.listStale(input.startedBefore, input.limit);
  let reclaimed = 0;
  for (const job of stale) {
    const outcome = await reclaimStaleJob(job.id, dependencies);
    if (outcome.outcome === "failed") reclaimed += 1;
  }
  return reclaimed;
}

export { runRenderJob };
export type { RenderJobOutcome };
