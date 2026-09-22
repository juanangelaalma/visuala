"use client";

import { useActionState } from "react";
import { approveVideoProjectAction, type ApproveVideoProjectResult } from "../actions/approve-video-project-action";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const initialState: ApproveVideoProjectResult = {};

type VideoApprovalPanelProps = {
  projectId: string;
  briefComplete: boolean;
  hasStoryboard: boolean;
  approved: boolean;
};

export function VideoApprovalPanel({ projectId, briefComplete, hasStoryboard, approved }: VideoApprovalPanelProps) {
  const [state, formAction, pending] = useActionState(approveVideoProjectAction, initialState);
  const canApprove = briefComplete && hasStoryboard && !approved;

  const blockedReason = !briefComplete
    ? "Brief belum lengkap."
    : !hasStoryboard
      ? "Storyboard belum tersedia."
      : null;

  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <h2 className="text-base font-semibold text-white">Persetujuan</h2>

      {approved ? (
        <p role="status" className="mt-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-white">
          Brief dan storyboard sudah disetujui. Snapshot versi ini yang dipakai untuk render.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-neutral-450">
          Setujui brief dan storyboard sebelum render. Setelah disetujui, versi ini tidak berubah lagi.
        </p>
      )}

      {blockedReason && !approved ? <p className="mt-2 text-xs text-neutral-500">{blockedReason}</p> : null}

      {state.error ? (
        <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p role="status" className="mt-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-white">
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className="mt-4">
        <input type="hidden" name="projectId" value={projectId} />
        <button
          type="submit"
          disabled={pending || !canApprove}
          aria-disabled={pending || !canApprove}
          className={`h-11 w-full rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
        >
          {pending ? "Menyetujui…" : approved ? "Sudah disetujui" : "Setujui brief dan storyboard"}
        </button>
      </form>
    </section>
  );
}
