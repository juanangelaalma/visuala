"use client";

import { useState } from "react";
import type { ProjectAsset, VideoModerationStatus } from "@/domain/video/types";
import { browserApiErrorMessage } from "@/lib/api/browser-client";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const moderationLabels: Record<VideoModerationStatus, string> = {
  pending: "Menunggu moderasi",
  allowed: "Aset disetujui",
  blocked: "Diblokir moderasi",
};

const moderationToneClassNames: Record<VideoModerationStatus, string> = {
  pending: "bg-black/80 text-neutral-300",
  allowed: "bg-primary text-black",
  blocked: "bg-danger/80 text-white",
};

/**
 * A row can outlive its object (an object removed by hand, or one written before the storage bucket
 * was consolidated under its final name). A missing preview renders as a labelled placeholder rather
 * than a broken image, and every tile is deletable, which is the way out of a stale row.
 */
export function ProjectAssetGallery({ assets, onDeleteAsset }: { assets: ProjectAsset[]; onDeleteAsset: (assetId: string) => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(assetId: string) {
    setError("");
    setBusyId(assetId);

    try {
      await onDeleteAsset(assetId);
    } catch (requestError) {
      setError(browserApiErrorMessage(requestError, "Aset tidak dapat dihapus. Coba lagi."));
    } finally {
      setBusyId(null);
    }
  }

  if (assets.length === 0) {
    return <p className="rounded-2xl border border-dashed border-white/15 bg-black p-4 text-sm text-neutral-450">Belum ada foto produk pada proyek ini.</p>;
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2">
        {assets.map((asset) => (
          <li key={asset.id} className="relative">
            {asset.previewUrl ? (
              <>
                {/* Signed preview URLs are minted per request, so they are rendered without the image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.previewUrl} alt="" className="aspect-square w-full rounded-xl object-cover outline outline-1 outline-white/10" />
                <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${moderationToneClassNames[asset.moderationStatus]}`}>
                  {moderationLabels[asset.moderationStatus]}
                </span>
              </>
            ) : (
              <span
                title={`${asset.mimeType}, ${asset.width}x${asset.height}`}
                className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-white/15 bg-black p-2 text-center font-mono text-[9px] uppercase leading-4 text-neutral-500"
              >
                Pratinjau tidak tersedia
              </span>
            )}

            <button
              type="button"
              onClick={() => remove(asset.id)}
              disabled={busyId !== null}
              aria-label="Hapus aset"
              className={`absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/80 text-sm text-white hover:bg-danger disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
            >
              {busyId === asset.id ? "…" : "×"}
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
          {error}
        </p>
      ) : null}
    </div>
  );
}
