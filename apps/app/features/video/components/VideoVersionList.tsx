"use client";

import { useState } from "react";
import { durationLabel } from "@/domain/video/settings";
import type { VideoVersion } from "@/domain/video/types";
import { browserApiErrorMessage } from "@/lib/api/browser-client";
import { videoAspectClass } from "./render-status-presentation";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type VideoVersionListProps = {
  projectId: string;
  versions: VideoVersion[];
  onDownloadVersion: (versionId: string) => Promise<void>;
};

/**
 * The newest version plays; the rest are a history list. The backend already orders versions newest
 * first, so the first entry is the one to watch and there is nothing to sort here.
 */
export function VideoVersionList({ projectId: _projectId, versions, onDownloadVersion }: VideoVersionListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function download(versionId: string) {
    setError("");
    setDownloadingId(versionId);
    try {
      await onDownloadVersion(versionId);
    } catch (requestError) {
      setError(browserApiErrorMessage(requestError, "Video tidak dapat diunduh. Coba lagi."));
    } finally {
      setDownloadingId(null);
    }
  }

  if (versions.length === 0) {
    return (
      <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
        <h2 className="text-base font-semibold text-white">Hasil video</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-450">Belum ada video yang selesai dirender.</p>
      </section>
    );
  }

  const newest = versions[0];

  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <h2 className="text-base font-semibold text-white">
        Hasil video <span className="float-right font-mono text-xs text-neutral-500">versi {newest?.versionNumber}</span>
      </h2>

      {newest?.playbackUrl ? (
        // Signed URLs are minted per request, so the file is played directly; the Next image/video
        // optimizer would cache a URL that expires in five minutes. The box matches the version's own
        // ratio, so a 16:9 or 1:1 render is not stretched into a portrait frame.
        <video
          controls
          playsInline
          preload="metadata"
          src={newest.playbackUrl}
          className={`mt-4 w-full rounded-2xl bg-black outline outline-1 outline-white/10 ${videoAspectClass(newest.aspectRatio)}`}
        >
          Pemutar video tidak didukung di peramban ini.
        </video>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black p-4 text-sm text-neutral-450">
          File video versi ini tidak tersedia lagi.
        </p>
      )}

      <ul className="mt-4 space-y-2 text-sm">
        {versions.map((version) => (
          <li key={version.id} className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-neutral-400">
              v{version.versionNumber} · {durationLabel(version.durationSeconds)} · {version.resolution}
            </span>
            {version.playbackUrl ? (
              <form onSubmit={(event) => { event.preventDefault(); void download(version.id); }}>
                <input type="hidden" name="projectId" value={_projectId} />
                <input type="hidden" name="versionId" value={version.id} />
                <button type="submit" disabled={downloadingId !== null} className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}>
                  {downloadingId === version.id ? "Mengunduh…" : "Unduh"}
                </button>
              </form>
            ) : (
              // The muted token that still clears AA on this surface; the darker one would not.
              <span className="font-mono text-xs text-neutral-500">tidak tersedia</span>
            )}
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">{error}</p> : null}
    </section>
  );
}
