import { Badge } from "@visuala/ui";
import type { VideoBrief, VideoBriefRevision } from "@/domain/video/types";

type BriefRow = { label: string; value: (brief: VideoBrief) => string | null };

const rows: readonly BriefRow[] = [
  { label: "Nama produk", value: (brief) => brief.productName },
  { label: "Kategori", value: (brief) => brief.productCategory },
  { label: "Audiens", value: (brief) => brief.audience },
  { label: "Tujuan", value: (brief) => brief.objective },
  { label: "Pesan utama", value: (brief) => brief.keyMessage },
  { label: "Penawaran", value: (brief) => (brief.offer ? `${brief.offer.label}: ${brief.offer.detail}` : null) },
  { label: "Ajakan", value: (brief) => brief.callToAction },
  { label: "Tujuan pemesanan", value: (brief) => brief.orderDestination },
  { label: "Merek", value: (brief) => brief.brandName },
  { label: "Daftar menu", value: (brief) => (brief.menuItems ? brief.menuItems.map((item) => (item.price ? `${item.name} (${item.price})` : item.name)).join(", ") : null) },
];

export function VideoBriefPanel({ revision }: { revision: VideoBriefRevision | null }) {
  if (!revision) {
    return (
      <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
        <h2 className="text-base font-semibold text-white">Brief</h2>
        <p className="mt-3 rounded-2xl border border-dashed border-white/15 bg-black p-4 text-sm leading-6 text-neutral-450">
          Belum ada brief. Jawab pertanyaan AI untuk menyusunnya.
        </p>
      </section>
    );
  }

  const { brief } = revision;
  const filled = rows.filter((row) => row.value(brief) !== null).length;

  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Brief</h2>
        <Badge className={`px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${revision.isComplete ? "bg-primary text-black" : "bg-white/10 text-neutral-300"}`}>
          {revision.isComplete ? "Lengkap" : "Draft"}
        </Badge>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        Versi {revision.version}, {filled} dari {rows.length} bagian terisi
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        {rows.map((row) => {
          const value = row.value(brief);
          return (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-neutral-450">{row.label}</dt>
              <dd className={`text-right ${value === null ? "text-neutral-600" : "text-white"}`}>{value ?? "Belum diketahui"}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
