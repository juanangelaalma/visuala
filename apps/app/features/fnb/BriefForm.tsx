"use client";

import { useId, type ChangeEvent } from "react";
import Image from "next/image";
import { discountedPrice, formatPrice, type CampaignAsset, type CampaignBrief } from "./types";

export function BriefForm({ brief, onChange, disabled, assets, upload, uploading, rightsConfirmed, onRightsChange }: {
  brief: CampaignBrief; onChange: (brief: CampaignBrief) => void; disabled: boolean; assets: CampaignAsset[];
  upload: (file: File, kind: "product" | "logo") => Promise<void>; uploading: string | null;
  rightsConfirmed: boolean; onRightsChange: (value: boolean) => void;
}) {
  const prefix = useId();

  const fields = [
    { key: "campaignName", label: "Nama campaign", max: 100, required: true },
    { key: "productName", label: "Nama produk", max: 100, required: true },
    { key: "brandName", label: "Nama brand", max: 100, required: true },
    { key: "promoPeriod", label: "Periode promo (opsional)", max: 100, required: false },
    { key: "cta", label: "Ajakan pembelian (CTA)", max: 80, required: true },
  ] as const;

  async function selectFile(event: ChangeEvent<HTMLInputElement>, kind: "product" | "logo") {
    const file = event.target.files?.[0];

    if (file) await upload(file, kind);
    event.target.value = "";
  }

  return <fieldset disabled={disabled} className="fnb-fieldset">
    <div className="fnb-form-grid">
      {fields.map(({ key, label, max, required }) => <label className="fnb-field" key={key} htmlFor={`${prefix}-${key}`}>
        <span>{label}</span><input id={`${prefix}-${key}`} value={brief[key]} required={required} maxLength={max} onChange={(event) => onChange({ ...brief, [key]: event.target.value })} />
      </label>)}
      <label className="fnb-field" htmlFor={`${prefix}-price`}><span>Harga asli (rupiah)</span><input id={`${prefix}-price`} type="number" inputMode="numeric" min="1" max="9007199254740991" step="1" required value={brief.originalPrice || ""} onChange={(event) => onChange({ ...brief, originalPrice: Number(event.target.value) })} /></label>
      <label className="fnb-field" htmlFor={`${prefix}-discount`}><span>Diskon (%)</span><input id={`${prefix}-discount`} type="number" inputMode="numeric" min="1" max="100" step="1" required value={brief.discountPercent || ""} onChange={(event) => onChange({ ...brief, discountPercent: Number(event.target.value) })} /></label>
    </div>
    {Number.isSafeInteger(brief.originalPrice) && Number.isSafeInteger(brief.discountPercent) && brief.originalPrice > 0 && brief.discountPercent > 0 && brief.discountPercent <= 100 && <p className="fnb-note">Harga promo: <strong>{formatPrice(discountedPrice(brief))}</strong>. Dibulatkan ke rupiah terdekat.</p>}
    <label className="fnb-checkbox"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => onRightsChange(event.target.checked)} /><span>Saya memiliki izin menggunakan gambar produk dan logo yang diunggah.</span></label>
    <div className="fnb-form-grid">
      {(["product", "logo"] as const).map((kind) => {
        const selectedId = kind === "product" ? brief.productAssetId : brief.logoAssetId;
        const selected = assets.find((asset) => asset.id === selectedId);

        return <div className="fnb-asset" key={kind}>
          <label className="fnb-field" htmlFor={`${prefix}-${kind}`}><span>{kind === "product" ? "Gambar produk (wajib)" : "Logo brand (opsional)"}</span>
            <input id={`${prefix}-${kind}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={!rightsConfirmed || uploading !== null} onChange={(event) => void selectFile(event, kind)} />
          </label>
          {selected && <><Image src={selected.previewUrl} alt={kind === "product" ? `Produk ${brief.productName}` : `Logo ${brief.brandName}`} width={160} height={160} unoptimized className="fnb-asset-preview" /><p className="fnb-note" role="status">{kind === "product" ? "Gambar produk" : "Logo brand"} tersimpan. Pilih file lain untuk menggantinya.</p></>}
          {uploading === kind && <p role="status">Mengunggah {kind === "product" ? "produk" : "logo"}...</p>}
          {kind === "logo" && selectedId && <button type="button" className="fnb-button" onClick={() => onChange({ ...brief, logoAssetId: null })}>Tanpa logo</button>}
        </div>;
      })}
    </div>
    <p className="fnb-note">PNG, JPEG, atau WebP, maksimal 10 MB. Foto dengan latar boleh digunakan; gambar produk yang jelas akan lebih mudah dibaca.</p>
  </fieldset>;
}
