import type { ProjectAsset, VideoModerationStatus } from "@/domain/video/types";

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
 * Read-only for now. Adding and removing images inside the workspace belongs to the asset-manager
 * slice; the endpoints it needs already exist.
 */
export function ProjectAssetGallery({ assets }: { assets: ProjectAsset[] }) {
  if (assets.length === 0) {
    return <p className="rounded-2xl border border-dashed border-white/15 bg-black p-4 text-sm text-neutral-450">Belum ada foto produk pada proyek ini.</p>;
  }

  return (
    <ul className="grid grid-cols-3 gap-2">
      {assets.map((asset) => (
        <li key={asset.id} className="relative">
          {/* Signed preview URLs are minted per request, so they are rendered without the image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.previewUrl} alt="" className="aspect-square w-full rounded-xl object-cover outline outline-1 outline-white/10" />
          <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${moderationToneClassNames[asset.moderationStatus]}`}>
            {moderationLabels[asset.moderationStatus]}
          </span>
        </li>
      ))}
    </ul>
  );
}
