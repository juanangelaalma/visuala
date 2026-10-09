"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { BriefForm } from "./BriefForm";
import { campaignRequest, campaignAssetResponseSchema, campaignResponseSchema } from "./api";
import { creationRecoverySchema, readRecovery } from "./recovery";
import { emptyBrief, type Campaign, type CampaignAsset, type CampaignBrief } from "./types";

// Mount the storage-backed form only after hydration, without an effect-driven reset.
const subscribeToHydration = () => () => undefined;

const hydratedSnapshot = () => true;

const serverSnapshot = () => false;

export function CreateCampaign({ userId }: { userId: string }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, hydratedSnapshot, serverSnapshot);

  return <section className="fnb-page">
    <Link href="/dashboard" className="fnb-back">Kembali ke campaign</Link>
    <header className="fnb-header"><div><h1>Buat Video promo</h1><p>Campaign diskon F&B. Empat scene, 15 detik, 1080 × 1920, tanpa musik atau voiceover.</p></div></header>
    {hydrated ? <CreateCampaignForm key={userId} userId={userId} /> : <p role="status">Memuat brief...</p>}
  </section>;
}

function CreateCampaignForm({ userId }: { userId: string }) {
  const recoveryKey = `visuala:fnb:new:${userId}`;
  const router = useRouter();
  const [recovery] = useState(() => readRecovery(recoveryKey, creationRecoverySchema));
  const [brief, setBrief] = useState<CampaignBrief>(recovery?.brief ?? emptyBrief);
  const [campaign, setCampaign] = useState<Campaign | null>(recovery?.campaign ?? null);
  const [assets, setAssets] = useState<CampaignAsset[]>(recovery?.assets ?? []);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify({ brief, campaign, assets }));

      if (campaign) sessionStorage.setItem(`visuala:fnb:${campaign.id}`, JSON.stringify({ revision: campaign.revision, draft: null, brief }));
    } catch { /* Keep the editable in-memory draft when storage is unavailable. */ }
  }, [brief, campaign, assets, recoveryKey]);

  async function ensureCampaign() {
    if (campaign) return campaign;
    const title = brief.campaignName.trim();

    if (!title) throw new Error("Isi nama campaign sebelum mengunggah gambar.");
    const created = (await campaignRequest("", campaignResponseSchema, { method: "POST", body: { title } })).campaign;
    setCampaign(created);

 return created;
  }

  async function upload(file: File, kind: "product" | "logo") {
    setError(null); setUploading(kind);

    try {
      if (!rightsConfirmed) throw new Error("Konfirmasi izin penggunaan gambar terlebih dahulu.");

      if (file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Gunakan PNG, JPEG, atau WebP maksimal 10 MB.");
      const current = await ensureCampaign();
      const body = new FormData(); body.set("file", file); body.set("rightsConfirmed", "true");
      const { asset } = await campaignRequest(`/${current.id}/assets`, campaignAssetResponseSchema, { method: "POST", body });
      setAssets((previous) => [...previous, asset]);
      setBrief((previous) => ({ ...previous, [kind === "product" ? "productAssetId" : "logoAssetId"]: asset.id }));
    } catch (error) { setError(error instanceof Error ? error.message : "Unggah gagal. Coba lagi."); }
    finally { setUploading(null); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setBusy(true);

    try {
      if (!brief.productAssetId) throw new Error("Unggah gambar produk sebelum membuat storyboard.");
      const current = await ensureCampaign();
      await campaignRequest(`/${current.id}/generate`, campaignResponseSchema, { method: "POST", body: { brief, expectedRevision: current.revision } });

      try { sessionStorage.removeItem(recoveryKey); sessionStorage.removeItem(`visuala:fnb:${current.id}`); } catch { /* Navigation does not depend on browser storage. */ }

      router.push(`/dashboard/videos/${current.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Storyboard gagal dibuat. Brief dan aset tetap tersimpan."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={(event) => void generate(event)} className="fnb-panel">
      <BriefForm brief={brief} onChange={setBrief} disabled={busy || uploading !== null} assets={assets} upload={upload} uploading={uploading} rightsConfirmed={rightsConfirmed} onRightsChange={setRightsConfirmed} />
      {error && <p role="alert" className="fnb-error">{error} Brief tidak dihapus. Pilih Buat storyboard & style untuk mencoba lagi. {campaign && <Link href={`/dashboard/videos/${campaign.id}`}>Buka draft tersimpan</Link>}</p>}
      {busy && <p role="status" className="fnb-note">Sedang membuat storyboard dan style. Tunggu hingga selesai; brief dan gambar tetap tersimpan jika proses gagal.</p>}
      <div className="fnb-actions"><button className="fnb-button fnb-primary" disabled={busy || uploading !== null} type="submit">{busy ? "Membuat storyboard..." : "Buat storyboard & style"}</button>{campaign && <Link className="fnb-button" href={`/dashboard/videos/${campaign.id}`}>Buka draft campaign</Link>}</div>
  </form>;
}
