"use client";

import { useState } from "react";
import { durationLabel } from "@/domain/video/settings";
import type { VideoComposition } from "@/domain/video/types";
import { browserApiErrorMessage } from "@/lib/api/browser-client";
import { videoAspectClass } from "./render-status-presentation";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type VideoCompositionPanelProps = {
  composition: VideoComposition | null;
  /** The interview's own verdict: only a complete brief can be planned. */
  briefComplete: boolean;
  previewing: boolean;
  approving: boolean;
  onPlan: (mode: "preview" | "approve") => Promise<void>;
};

/**
 * The one screen the user decides on. The preview video is the focal element because it is the evidence;
 * the two verbs sit with it, and the plan behind it is supporting detail.
 */
export function VideoCompositionPanel({ composition, briefComplete, previewing, approving, onPlan }: VideoCompositionPanelProps) {
  const [error, setError] = useState("");
  const pending = previewing || approving;

  async function plan(mode: "preview" | "approve") {
    setError("");
    try {
      await onPlan(mode);
    } catch (requestError) {
      setError(browserApiErrorMessage(requestError, mode === "approve" ? "Tidak dapat memulai render. Coba lagi." : "Tidak dapat menyusun preview. Coba lagi."));
    }
  }

  if (!composition) {
    return (
      <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
        <h2 className="text-base font-semibold text-white">Preview</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-450">
          {briefComplete
            ? "Brief sudah lengkap. Susun komposisinya untuk melihat preview."
            : "Komposisi disusun setelah brief lengkap."}
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button
          type="button"
          onClick={() => void plan("preview")}
          disabled={!briefComplete || pending}
          aria-disabled={!briefComplete || pending}
          className={`mt-4 h-11 w-full rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-400 ${focusRing}`}
        >
          {previewing ? "Menyusun…" : "Susun preview"}
        </button>
        {!briefComplete ? <p className="mt-3 text-xs text-neutral-500">Ajukan pertanyaan di chat sampai brief lengkap.</p> : null}
      </section>
    );
  }

  const totalFrames = composition.spec.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
  const seconds = composition.spec.format.durationSeconds;

  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Preview</h2>
        <span className="font-mono text-xs text-neutral-500">
          komposisi v{composition.version} · {composition.designPack.id}@{composition.designPack.version}
        </span>
      </div>

      {composition.previewUrl ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={composition.previewUrl}
          className={`mt-4 w-full rounded-2xl bg-black outline outline-1 outline-white/10 ${videoAspectClass(composition.spec.format.aspectRatio)}`}
        >
          Pemutar video tidak didukung di peramban ini.
        </video>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black p-4 text-sm leading-6 text-neutral-450">
          Preview sedang dirender. Persetujuan terbuka setelah preview siap.
        </p>
      )}

      {/* A fallback means the model's plan was refused, which changes how much the plan can be trusted. */}
      <p className={`mt-3 text-xs leading-5 ${composition.isFallback ? "text-primary" : "text-neutral-500"}`}>
        {composition.isFallback
          ? `Komposisi cadangan dipakai: rencana dari AI ditolak${composition.validationIssues.length ? ` (${composition.validationIssues[0]?.code})` : ""}. Videonya tetap bisa dirender.`
          : "Rencana dari AI lolos validasi."}
      </p>

      {composition.validationIssues.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-neutral-400">
          {composition.validationIssues.map((issue) => (
            <li key={`${issue.code}-${issue.sceneId ?? ""}-${issue.moduleId ?? ""}`}>
              <span className="font-mono text-[11px] text-neutral-500">{issue.code}</span> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void plan("approve")}
          disabled={!composition.previewReady || pending}
          aria-disabled={!composition.previewReady || pending}
          className={`h-11 flex-1 rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-400 ${focusRing}`}
        >
          {approving ? "Memulai render…" : "Setujui dan render"}
        </button>
        <button
          type="button"
          onClick={() => void plan("preview")}
          disabled={pending}
          aria-disabled={pending}
          className={`h-11 flex-1 rounded-full bg-white/10 px-5 text-sm font-semibold text-neutral-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
        >
          {previewing ? "Menyusun…" : "Generate ulang"}
        </button>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-white">
        Rencana <span className="float-right font-mono text-xs text-neutral-500">{composition.spec.scenes.length} scene · {seconds} detik</span>
      </h3>
      <ol className="mt-3 space-y-2">
        {composition.spec.scenes.map((scene, index) => (
          <li key={scene.id} className="rounded-2xl border border-white/10 bg-pricing-bg p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-wide text-primary">Scene {index + 1}</span>
              <span className="font-mono text-[10px] text-neutral-450">{durationLabel(Math.round(scene.durationFrames / composition.spec.format.fps))}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {scene.modules.map((module) => (
                <li key={`${module.id}-${module.kind}`} className="text-xs leading-5 text-neutral-300">
                  <span className="font-mono text-[11px] text-neutral-500">{module.kind === "catalog" ? "katalog" : "modul"}</span> {module.id}
                  {Object.values(module.content).length > 0 ? <span className="text-neutral-450">: {Object.values(module.content).join(" / ")}</span> : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-[11px] text-neutral-500">{totalFrames} frame @ {composition.spec.format.fps}fps</p>
    </section>
  );
}

function ErrorNote({ children }: { children: string }) {
  return (
    <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
      {children}
    </p>
  );
}
