"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoRenderJob, VideoVersion } from "@/domain/video/types";
import { BrowserApiError, browserApiErrorMessage } from "@/lib/api/browser-client";
import { videoApi } from "../api/video-api";
import { videoRenderJobResponseSchema, videoVersionListSchema } from "../schemas/render-schema";
import { isJobActive, renderStatusPresentation } from "./render-status-presentation";

const POLL_MS = 3000;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type RenderStatusPanelProps = {
  projectId: string;
  initialJob: VideoRenderJob | null;
  /** Lets the workspace keep its version list in sync without polling the endpoints itself. */
  onVersionsChange?: (versions: VideoVersion[]) => void;
  /** Fired once when a job reaches a terminal state, so the workspace can pick up a finished preview. */
  onSettled?: () => void;
};

/** An auth or ownership failure will not clear on its own, so polling for it is wasted requests. */
function isFatalPollError(error: unknown): boolean {
  return error instanceof BrowserApiError && (error.status === 401 || error.status === 403 || error.status === 404);
}

/**
 * The render control and the current job's status. It polls the backend directly from the browser;
 * the workspace remounts it when the render job identity changes, so its local job state is only
 * ever the current render's.
 */
export function RenderStatusPanel({ projectId, initialJob, onVersionsChange, onSettled }: RenderStatusPanelProps) {
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [pending, setPending] = useState(false);
  const [stopped, setStopped] = useState(false);
  const previousProjectId = useRef(projectId);

  // A different project means a different job; drop the old job and resume polling for the new one.
  useEffect(() => {
    if (previousProjectId.current === projectId) return;
    previousProjectId.current = projectId;
    setJob(initialJob);
    setStopped(false);
    setPollError("");
    setMutationError("");
  }, [projectId, initialJob]);

  // Poll only while a job is in flight: a terminal job never changes again, and polling for the
  // lifetime of the page would be a request every three seconds for nothing.
  useEffect(() => {
    if (stopped || !job || !isJobActive(job)) return undefined;

    const controller = new AbortController();
    let inFlight = false;

    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;

      void videoApi
        .getRenderStatus(projectId, controller.signal)
        .then(({ job: polledJob, versions }) => {
          if (controller.signal.aborted) return;
          // A shape the panel cannot render is a failure, not blanks; both values land together.
          const nextJob = videoRenderJobResponseSchema.parse({ job: polledJob }).job;
          const nextVersions = videoVersionListSchema.parse({ versions }).versions;
          setPollError("");
          setJob(nextJob);
          onVersionsChange?.(nextVersions);
          // A finished preview is not visible until the composition is re-read, so ask once it lands.
          if (nextJob && !isJobActive(nextJob)) onSettled?.();
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPollError(browserApiErrorMessage(error, "Tidak dapat memuat status render."));
          if (isFatalPollError(error)) setStopped(true);
        })
        .finally(() => {
          inFlight = false;
        });
    }, POLL_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [stopped, job, projectId, onVersionsChange, onSettled]);

  async function cancelRender() {
    if (!job) return;
    setMutationError("");
    setPending(true);

    try {
      const { job: nextJob } = await videoApi.cancelRender(projectId, job.id);
      setJob(nextJob);
    } catch (error) {
      setMutationError(browserApiErrorMessage(error, "Tidak dapat membatalkan render. Coba lagi."));
    } finally {
      setPending(false);
    }
  }

  const presentation = job ? renderStatusPresentation(job) : null;
  const error = mutationError || pollError;

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
        <p className="mt-3 text-sm leading-6 text-neutral-450">Belum ada render berjalan.</p>
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
        <button
          type="button"
          onClick={() => void cancelRender()}
          // Only a `queued` job can be cancelled; the worker's claim is not reversible.
          disabled={job.status !== "queued" || pending}
          aria-disabled={job.status !== "queued" || pending}
          className={`mt-4 h-11 w-full rounded-full bg-white/10 px-5 text-sm font-semibold text-neutral-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
        >
          {job.status === "queued" ? "Batalkan render" : "Render sedang berjalan"}
        </button>
      ) : null}
    </section>
  );
}
