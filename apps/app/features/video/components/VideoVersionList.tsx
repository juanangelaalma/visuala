import { durationLabel } from "@/domain/video/settings";
import type { VideoVersion } from "@/domain/video/types";
import { downloadVideoVersionAction } from "../actions/download-video-version-action";
import { videoAspectClass } from "./render-status-presentation";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type VideoVersionListProps = {
  projectId: string;
  versions: VideoVersion[];
};

/**
 * The newest version plays; the rest are a history list. The backend already orders versions newest
 * first, so the first entry is the one to watch and there is nothing to sort here.
 */
export function VideoVersionList({ projectId, versions }: VideoVersionListProps) {
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
              <form action={downloadVideoVersionAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="versionId" value={version.id} />
                {/* `min-h-11` keeps the tap target at 44px without changing the small label style. */}
                <button type="submit" className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-primary hover:underline ${focusRing}`}>
                  Unduh
                </button>
              </form>
            ) : (
              // The muted token that still clears AA on this surface; the darker one would not.
              <span className="font-mono text-xs text-neutral-500">tidak tersedia</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
