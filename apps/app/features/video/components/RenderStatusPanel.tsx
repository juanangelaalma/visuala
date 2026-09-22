"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoRenderJob } from "@/domain/video/types";
import { cancelVideoRenderAction, type CancelVideoRenderResult } from "../actions/cancel-video-render-action";
import { getVideoRenderStatusAction } from "../actions/get-video-render-status-action";
import { startVideoRenderAction, type StartVideoRenderResult } from "../actions/start-video-render-action";
import { isJobActive, renderStatusPresentation } from "./render-status-presentation";

const POLL_MS = 3000;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const startState: StartVideoRenderResult = {};
const cancelState: CancelVideoRenderResult = {};

type RenderStatusPanelProps = {
  projectId: string;
  initialJob: VideoRenderJob | null;
  /** The backend's own intake condition: it refuses a render unless the project is `approved`. */
  canRender: boolean;
  quotaExhausted: boolean;
};

/**
 * The render control and the current job's status. The page remounts this component whenever the
 * server's job identity changes (via `key`), so the local job state it polls into is only ever the
 * server's job, never a stale one from an earlier render.
 */
export function RenderStatusPanel({ projectId, initialJob, canRender, quotaExhausted }: RenderStatusPanelProps) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState("");
  const [startResult, start] = useActionState(startVideoRenderAction, startState);
  const [cancelResult, cancel] = useActionState(cancelVideoRenderAction, cancelState);

  // Poll only while a job is in flight: a terminal job never changes again, and polling for the
  // lifetime of the page would be a request every three seconds for nothing.
  useEffect(() => {
    if (!job || !isJobActive(job)) return undefined;
    const timer = setInterval(() => {
      void getVideoRenderStatusAction({ projectId }).then((result) => {
        if (result.error) {
          setPollError(result.error);
          return;
        }
        const next = result.status?.jobs[0] ?? null;
        setJob(next);
        // A terminal job has moved the project itself, so refresh the server-rendered page once.
        if (!next || !isJobActive(next)) router.refresh();
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, projectId, router]);

  const presentation = job ? renderStatusPresentation(job) : null;
  const error = startResult.error ?? cancelResult.error ?? pollError;
  const renderable = canRender && !quotaExhausted;
  const blockedReason = quotaExhausted
    ? "Kuota revisi 3/3 sudah terpakai."
    : !canRender
      ? "Render tersedia setelah brief dan storyboard disetujui."
      : null;

  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <h2 className="text-base font-semibold text-white">Render</h2>

      {job && presentation ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-450">Status</dt>
            <dd className="text-right font-mono text-xs font-semibold text-primary">{presentation.label}</dd>
          </div>
          {job.attempts > 1 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-450">Percobaan</dt>
              <dd className="font-mono text-xs text-white">{job.attempts}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-3 text-sm leading-6 text-neutral-450">
          {canRender ? "Video siap dirender." : "Render tersedia setelah brief dan storyboard disetujui."}
        </p>
      )}

      {presentation?.detail ? (
        <p role="status" className="mt-3 rounded-2xl border border-white/10 bg-black px-3 py-2 text-xs leading-5 text-neutral-300">
          {presentation.detail}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
          {error}
        </p>
      ) : null}

      {job && isJobActive(job) ? (
        <form action={cancel} className="mt-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="jobId" value={job.id} />
          <button
            type="submit"
            // Only a `queued` job can be cancelled; the worker's claim is not reversible.
            disabled={job.status !== "queued"}
            aria-disabled={job.status !== "queued"}
            className={`h-11 w-full rounded-full bg-white/10 px-5 text-sm font-semibold text-neutral-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            {job.status === "queued" ? "Batalkan render" : "Render sedang berjalan"}
          </button>
        </form>
      ) : (
        <form action={start} className="mt-4">
          <input type="hidden" name="projectId" value={projectId} />
          <button
            type="submit"
            disabled={!renderable}
            aria-disabled={!renderable}
            className={`h-11 w-full rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-400 ${focusRing}`}
          >
            {job?.status === "succeeded" ? "Render ulang" : "Render video"}
          </button>
        </form>
      )}

      {blockedReason ? <p className="mt-3 text-xs text-neutral-500">{blockedReason}</p> : null}
    </section>
  );
}
