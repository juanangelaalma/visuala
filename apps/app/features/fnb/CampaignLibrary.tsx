"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { campaignRequest, campaignListResponseSchema } from "./api";
import { statusLabels, type Campaign } from "./types";

export function CampaignLibrary() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const loaded = await campaignRequest("", campaignListResponseSchema, { signal: controller.signal });

        if (!controller.signal.aborted) setCampaigns(loaded.campaigns);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Campaign tidak dapat dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [loadAttempt]);
  const filtered = campaigns.filter((campaign) => campaign.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  return <section className="fnb-page">
    <header className="fnb-header"><div><h1>Campaign saya</h1><p>Video promo F&B, dari brief hingga MP4. 15 detik, portrait, tanpa audio.</p></div><Link className="fnb-button fnb-primary" href="/dashboard/videos/new">Buat Video</Link></header>
    <label className="fnb-field fnb-search"><span>Cari campaign</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {loading && <p role="status" className="fnb-panel">Memuat campaign tersimpan...</p>}
    {error && <div role="alert" className="fnb-error"><p>{error}</p><button type="button" className="fnb-button" onClick={() => { setLoading(true); setError(null); setLoadAttempt((value) => value + 1); }}>Muat ulang campaign</button></div>}
    {!loading && !error && !campaigns.length && <div className="fnb-panel fnb-empty"><h2>Belum ada campaign</h2><p>Masukkan detail promo dan gambar produk untuk membuat storyboard pertama Anda.</p><Link className="fnb-button fnb-primary" href="/dashboard/videos/new">Buat campaign promo</Link></div>}
    {!loading && !error && campaigns.length > 0 && !filtered.length && <p className="fnb-panel">Tidak ada campaign dengan nama tersebut. Ubah pencarian Anda.</p>}
    <div className="fnb-library">{filtered.map((campaign) => <Link className="fnb-campaign" key={campaign.id} href={`/dashboard/videos/${campaign.id}`}>
      <div><h2>{campaign.title}</h2><p>{campaign.draft?.brief.productName || "Brief belum selesai"}</p></div>
      <div className="fnb-campaign-meta"><strong>{statusLabels[campaign.status]}</strong><span>Revisi {campaign.revision}</span><time dateTime={campaign.updatedAt}>{new Date(campaign.updatedAt).toLocaleDateString("id-ID")}</time></div>
      <span>Buka campaign</span>
    </Link>)}</div>
  </section>;
}
