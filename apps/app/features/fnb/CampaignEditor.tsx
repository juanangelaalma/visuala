"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BriefForm } from "./BriefForm";
import { CampaignPreview } from "./CampaignPreview";
import { campaignRequest, CampaignRequestError, campaignAssetResponseSchema, campaignDetailResponseSchema, campaignFailureSchema, campaignResponseSchema, downloadResponseSchema, renderJobResponseSchema, stylePresetsResponseSchema, type StylePreset } from "./api";
import { editorRecoverySchema, readRecovery } from "./recovery";
import { emptyBrief, sceneLabels, statusLabels, type CampaignBrief, type CampaignDetail, type CampaignDraft, type RenderJob, type Scene } from "./types";

type ReviewIdentity = { revision: number; draft: CampaignDraft; previewState: { revision: number | null; ready: boolean; error: string | null } };

export function CampaignEditor({ campaignId }: { campaignId: string }) {
  return <CampaignEditorSession key={campaignId} campaignId={campaignId} />;
}

function CampaignEditorSession({ campaignId }: { campaignId: string }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [brief, setBrief] = useState<CampaignBrief>(emptyBrief);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [sceneId, setSceneId] = useState("hook");
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<{ revision: number | null; ready: boolean; error: string | null }>({ revision: null, ready: false, error: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reviewIdentity, setReviewIdentity] = useState<ReviewIdentity | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const renderKey = useRef<{ revision: number; key: string } | null>(null);
  const recoveryKey = `visuala:fnb:${campaignId}`;
  const campaign = detail?.campaign;
  const dirty = campaign ? JSON.stringify(draft) !== JSON.stringify(campaign.draft) || (!draft && JSON.stringify(brief) !== JSON.stringify(emptyBrief)) : false;
  const outdated = !campaign || dirty || campaign.compositionRevision !== campaign.revision || previewRevision !== campaign.revision || campaign.validationErrors.length > 0;
  const canApprove = !!campaign && !!draft && !outdated && !conflict && previewState.ready && previewState.revision === campaign.revision && !previewState.error;
  const reviewConfirmed = canApprove && reviewIdentity?.revision === campaign?.revision && reviewIdentity?.draft === draft && reviewIdentity?.previewState === previewState;
  const selectedVersion = detail?.versions.find((version) => version.revision === previewRevision);
  const previewScenes = selectedVersion?.draft.plan.scenes ?? campaign?.draft?.plan.scenes ?? [];
  const selectedScene = draft?.plan.scenes.find((scene) => scene.id === sceneId);
  const onPreviewState = useCallback((state: { revision: number | null; ready: boolean; error: string | null }) => setPreviewState(state), []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [loaded, styles] = await Promise.all([
          campaignRequest(`/${campaignId}`, campaignDetailResponseSchema),
          campaignRequest("/style-presets", stylePresetsResponseSchema),
        ]);

        if (!active) return;
        setDetail(loaded); setPresets(styles.presets); setDraft(loaded.campaign.draft);
        setBaseRevision(loaded.campaign.revision);
        setBrief(loaded.campaign.draft?.brief ?? emptyBrief); setPreviewRevision(loaded.campaign.compositionRevision);
        const recovery = readRecovery(recoveryKey, editorRecoverySchema);

        if (recovery && (recovery.draft || !loaded.campaign.draft || JSON.stringify(recovery.brief) !== JSON.stringify(loaded.campaign.draft.brief))) {
          setDraft(recovery.draft ?? (loaded.campaign.draft ? { ...loaded.campaign.draft, brief: recovery.brief } : null)); setBrief(recovery.brief);
          setBaseRevision(recovery.revision);

          if (recovery.revision !== loaded.campaign.revision) setConflict(true);
          setNotice("Draft lokal dipulihkan. Periksa perubahan sebelum menyimpan.");
        }

        setInitialized(true);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Campaign gagal dimuat."); }
    }

    void load();

    return () => { active = false; };
  }, [campaignId, recoveryKey, loadAttempt]);

  useEffect(() => {
    if (!initialized || !campaign) return;

    try {
      if (dirty) sessionStorage.setItem(recoveryKey, JSON.stringify({ revision: baseRevision, draft, brief }));
      else sessionStorage.removeItem(recoveryKey);
    } catch { /* Failure to cache locally must not prevent server saves. */ }
  }, [initialized, campaign, draft, brief, dirty, recoveryKey, baseRevision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const activeJobs = detail?.renderJobs.filter((job) => job.status === "queued" || job.status === "rendering") ?? [];
  const activeJobIds = activeJobs.map((job) => job.id).join(",");
  useEffect(() => {
    if (!activeJobIds) return;
    let stopped = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const jobs = await Promise.all(activeJobIds.split(",").map(async (id) => (await campaignRequest(`/${campaignId}/render-jobs/${id}`, renderJobResponseSchema)).job));

        if (stopped) return;

        if (jobs.some((job) => job.status === "queued" || job.status === "rendering")) {
          setDetail((previous) => previous ? { ...previous, renderJobs: previous.renderJobs.map((job) => jobs.find((fresh) => fresh.id === job.id) ?? job) } : previous);
          timer = window.setTimeout(() => void poll(), 2500);
        }
        else {
          const loaded = await campaignRequest(`/${campaignId}`, campaignDetailResponseSchema);

          if (!stopped) setDetail((previous) => previous ? { ...previous, campaign: loaded.campaign.revision === previous.campaign.revision ? loaded.campaign : previous.campaign, renderJobs: loaded.renderJobs } : previous);
        }
      } catch (error) { if (!stopped) setError(error instanceof Error ? error.message : "Status render gagal dimuat. Gunakan Muat status."); }
    }

    timer = window.setTimeout(() => void poll(), 1500);

    return () => { stopped = true; clearTimeout(timer); };
  }, [campaignId, activeJobIds]);

  async function refreshMetadata(expectedRevision: number | null = campaign?.revision ?? null) {
    const loaded = await campaignRequest(`/${campaignId}`, campaignDetailResponseSchema);

    if (expectedRevision !== null && loaded.campaign.revision !== expectedRevision) setConflict(true);
    setDetail(loaded);

 return loaded;
  }

  function fail(error: Error) {
    if (error instanceof CampaignRequestError && error.status === 409) setConflict(true);
    setError(error.message);
  }

  function selectPreviewRevision(revision: number | null) {
    if (revision === previewRevision) return;
    setPreviewRevision(revision);
    setPreviewState({ revision, ready: false, error: null });
  }

  function editBrief(next: CampaignBrief) { setBrief(next);

 if (draft) setDraft({ ...draft, brief: next }); }

  function editScene(update: Partial<Scene>) {
    if (!draft) return;
    setDraft({ ...draft, plan: { scenes: draft.plan.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...update } : scene) } });
  }

  async function upload(file: File, kind: "product" | "logo") {
    setUploading(kind); setError(null);

    try {
      if (!rightsConfirmed) throw new Error("Konfirmasi izin penggunaan aset terlebih dahulu.");

      if (file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Gunakan PNG, JPEG, atau WebP maksimal 10 MB.");
      const body = new FormData(); body.set("file", file); body.set("rightsConfirmed", "true");
      const { asset } = await campaignRequest(`/${campaignId}/assets`, campaignAssetResponseSchema, { method: "POST", body });
      setDetail((previous) => previous ? { ...previous, assets: [...previous.assets, asset] } : previous);
      const field = kind === "product" ? "productAssetId" : "logoAssetId";
      setBrief((previous) => ({ ...previous, [field]: asset.id }));
      setDraft((previous) => previous ? { ...previous, brief: { ...previous.brief, [field]: asset.id }, plan: { scenes: previous.plan.scenes.map((scene) => kind === "product" && scene.id === sceneId ? { ...scene, productAssetId: asset.id } : scene) } } : previous);
    } catch (error) { fail(campaignFailureSchema.parse(error)); }
    finally { setUploading(null); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

 if (!campaign || conflict || busy || uploading !== null) return;
    setBusy(draft ? "save" : "generate"); setError(null); setNotice(null);

    try {
      if (!brief.productAssetId) throw new Error("Unggah gambar produk terlebih dahulu.");

      const { campaign: saved } = await campaignRequest(`/${campaignId}/${draft ? "draft" : "generate"}`, campaignResponseSchema, {
        method: draft ? "PUT" : "POST", body: draft ? { draft, expectedRevision: baseRevision } : { brief, expectedRevision: baseRevision },
      });

      setDetail((previous) => previous ? { ...previous, campaign: saved } : previous);
      setDraft(saved.draft); setBrief(saved.draft?.brief ?? brief); selectPreviewRevision(saved.compositionRevision);
      setBaseRevision(saved.revision);
      setConflict(false); setNotice(saved.validationErrors.length ? "Revisi tersimpan. Komposisi belum valid; preview sebelumnya tetap tersedia." : `Revisi ${saved.revision} tersimpan dan preview diperbarui.`);
      await refreshMetadata(saved.revision);
    } catch (error) { fail(campaignFailureSchema.parse(error)); }
    finally { setBusy(null); }
  }

  async function approve() {
    if (!campaign || !canApprove || !reviewConfirmed) return;
    setBusy("approve"); setError(null);

    try {
      const { campaign: approved } = await campaignRequest(`/${campaignId}/approve`, campaignResponseSchema, { method: "POST", body: { expectedRevision: campaign.revision } });
      setDetail((previous) => previous ? { ...previous, campaign: approved } : previous);
      setNotice(`Revisi ${approved.revision} disetujui. Pilih Render MP4 untuk memulai.`);
      await refreshMetadata(approved.revision);
    } catch (error) { fail(campaignFailureSchema.parse(error)); }
    finally { setBusy(null); }
  }

  async function render(failedJob?: RenderJob) {
    const revision = failedJob?.revision ?? campaign?.revision;

    if (!campaign || revision === undefined) return;
    const approvedVersion = detail?.versions.find((version) => version.revision === revision && version.validated && version.approvedAt);

    if (revision === campaign.revision ? !canApprove || campaign.approvedRevision !== revision : !approvedVersion || previewRevision !== revision || !previewState.ready || previewState.revision !== revision) return;
    setBusy("render"); setError(null);

    if (failedJob) renderKey.current = { revision, key: failedJob.idempotencyKey };
    else if (!renderKey.current || renderKey.current.revision !== revision) renderKey.current = { revision, key: crypto.randomUUID() };

    try {
      const { job } = await campaignRequest(`/${campaignId}/render`, renderJobResponseSchema, { method: "POST", body: { revision, idempotencyKey: renderKey.current.key } });
      setDetail((previous) => previous ? { ...previous, renderJobs: [job, ...previous.renderJobs.filter((existing) => existing.id !== job.id)] } : previous);
      setNotice("Render dimulai. Anda dapat tetap mengedit draft; job memakai versi yang disetujui.");
    } catch (error) { fail(campaignFailureSchema.parse(error)); }
    finally { setBusy(null); }
  }

  async function download(job: RenderJob) {
    setBusy(`download-${job.id}`); setError(null);

    try {
      const { url } = await campaignRequest(`/${campaignId}/download/${job.id}`, downloadResponseSchema);
      const target = new URL(url);
      target.searchParams.set("download", `${campaign?.title || "campaign"}-r${job.revision}.mp4`);

      const link = document.createElement("a"); link.href = target.href; link.download = `${campaign?.title || "campaign"}-r${job.revision}.mp4`; link.rel = "noopener"; link.click();
    } catch (error) { fail(campaignFailureSchema.parse(error)); }
    finally { setBusy(null); }
  }

  async function resolveConflict() {
    setBusy("refresh"); setError(null);

    try { const loaded = await refreshMetadata(null); setBaseRevision(loaded.campaign.revision); setConflict(false); setNotice("Revisi server terbaru dimuat. Draft lokal tetap dipertahankan. Bandingkan versi lalu simpan hanya setelah meninjau perubahan."); }
    catch (error) { fail(campaignFailureSchema.parse(error)); }
    finally { setBusy(null); }
  }

  if (!detail) return <section className="fnb-page"><Link href="/dashboard" className="fnb-back">Kembali ke campaign</Link>{error ? <div role="alert" className="fnb-error"><p>{error}</p><button className="fnb-button" type="button" onClick={() => { setError(null); setLoadAttempt((value) => value + 1); }}>Muat ulang campaign</button></div> : <p role="status">Memuat campaign dan versi tersimpan...</p>}</section>;

  return <section className="fnb-page">
    <Link href="/dashboard" className="fnb-back">Kembali ke campaign</Link>
    <header className="fnb-header"><div><h1>{detail.campaign.title}</h1><p>{statusLabels[detail.campaign.status]} · Revisi {detail.campaign.revision} · 15 detik · 1080 × 1920 · Tanpa audio</p></div><span className="fnb-save-state">{dirty ? "Perubahan belum disimpan" : "Draft tersimpan"}</span></header>
    {error && <p className="fnb-error" role="alert">{error} Draft lokal tetap tersedia.</p>}
    {notice && <p className="fnb-notice" role="status">{notice}</p>}
    {conflict && <div className="fnb-warning" role="alert"><p>Campaign berubah di sesi lain. Simpan dan approval dikunci agar tidak menimpa revisi baru diam-diam.</p><button type="button" className="fnb-button" disabled={!!busy} onClick={() => void resolveConflict()}>Muat revisi terbaru, pertahankan draft saya</button></div>}
    <div className="fnb-workspace">
      <form className="fnb-edit-column" onSubmit={(event) => void save(event)}>
        <section className="fnb-panel"><h2>Brief & aset</h2><BriefForm brief={brief} onChange={editBrief} disabled={!!busy || uploading !== null} assets={detail.assets} upload={upload} uploading={uploading} rightsConfirmed={rightsConfirmed} onRightsChange={setRightsConfirmed} /></section>
        {draft && <section className="fnb-panel"><h2>Storyboard</h2><p className="fnb-note">Urutan dan durasi dikunci. Pilih scene untuk mengedit kontennya.</p><div className="fnb-scene-tabs">{draft.plan.scenes.map((scene) => <button type="button" className="fnb-button" disabled={uploading !== null} key={scene.id} aria-pressed={sceneId === scene.id} onClick={() => setSceneId(scene.id)}>{sceneLabels[scene.id]}<small>{scene.start}–{scene.start + scene.duration}s</small></button>)}</div>
          {selectedScene && <fieldset disabled={!!busy || uploading !== null} className="fnb-fieldset"><legend>{sceneLabels[selectedScene.id]}</legend>
            {(["headline", "subheadline", "cta"] as const).map((field) => <label className="fnb-field" key={field}><span>{field === "headline" ? "Headline" : field === "subheadline" ? "Subheadline" : "CTA scene"}</span><textarea rows={field === "headline" ? 2 : 3} maxLength={field === "headline" ? 100 : field === "subheadline" ? 160 : 80} required={field === "headline"} value={selectedScene[field]} onChange={(event) => editScene({ [field]: event.target.value })} /></label>)}
            <label className="fnb-field"><span>Gambar produk scene</span><select value={selectedScene.productAssetId} onChange={(event) => editScene({ productAssetId: event.target.value })}>{detail.assets.map((asset, index) => <option key={asset.id} value={asset.id}>Aset {index + 1} · {asset.width} × {asset.height}</option>)}</select></label>
            <button type="button" className="fnb-button" disabled={!detail.campaign.initialPlan} onClick={() => { const initial = detail.campaign.initialPlan?.scenes.find((scene) => scene.id === sceneId);

 if (initial) editScene(initial); }}>Reset scene ke hasil AI awal</button>
          </fieldset>}
        </section>}
        {draft && <section className="fnb-panel"><h2>Visual style</h2><label className="fnb-field"><span>Palette & style preset</span><select disabled={!!busy} value={presets.find((preset) => JSON.stringify(preset.tokens) === JSON.stringify(draft.style))?.id ?? "ai"} onChange={(event) => { const preset = presets.find((preset) => preset.id === event.target.value);

 if (preset) setDraft({ ...draft, style: preset.tokens }); }}><option value="ai" disabled>Style rekomendasi AI</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label><div className="fnb-swatches">{(["primary", "secondary", "accent", "background", "text"] as const).map((token) => <span key={token}><i style={{ background: draft.style[token] }} aria-hidden="true" />{token}: {draft.style[token]}</span>)}</div><p className="fnb-note">{draft.style.typography} · {draft.style.backgroundTreatment} · {draft.style.density}. Warna asli produk dan logo tidak diubah.</p></section>}
        <div className="fnb-actions"><button className="fnb-button fnb-primary" type="submit" disabled={!!busy || uploading !== null || conflict}>{busy === "save" ? "Menyimpan & memvalidasi..." : busy === "generate" ? "Membuat storyboard..." : draft ? "Simpan & perbarui preview" : "Buat storyboard & style"}</button></div>
      </form>
      <div className="fnb-preview-column">
        <section className="fnb-panel"><label className="fnb-field"><span>Versi preview</span><select value={previewRevision ?? ""} onChange={(event) => selectPreviewRevision(event.target.value ? Number(event.target.value) : null)}><option value="" disabled>Belum ada komposisi valid</option>{detail.versions.filter((version) => version.validated).map((version) => <option value={version.revision} key={version.revision}>Revisi {version.revision}{version.approvedAt ? " · Disetujui" : ""}{version.revision === detail.campaign.revision ? " · Terbaru" : ""}</option>)}</select></label>
          {selectedVersion && selectedVersion.revision !== detail.campaign.revision && <div><p className="fnb-note">Anda sedang meninjau versi lama. Render versi ini tidak akan otomatis disetujui.</p><button type="button" className="fnb-button" disabled={!!busy} onClick={() => { setDraft(selectedVersion.draft); setBrief(selectedVersion.draft.brief); setNotice("Konten versi dipulihkan ke draft lokal. Simpan sebagai revisi baru untuk approval."); }}>Gunakan versi ini sebagai draft baru</button></div>}
        </section>
        <CampaignPreview campaignId={campaignId} revision={previewRevision} scenes={previewScenes} selectedScene={sceneId} outdated={outdated} onSceneSelect={setSceneId} onStateChange={onPreviewState} />
        {detail.campaign.validationErrors.length > 0 && <section className="fnb-error" role="alert"><h2>Komposisi belum valid</h2><ul>{detail.campaign.validationErrors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul><p>Perbaiki draft lalu simpan kembali. Preview sebelumnya tidak dihapus.</p></section>}
        <section className="fnb-panel"><h2>Approval & render</h2><p className="fnb-note">Approval mengunci komposisi revisi yang ditinjau. Perubahan berikutnya membuat revisi baru.</p><label className="fnb-checkbox"><input type="checkbox" disabled={!canApprove || !!busy} checked={reviewConfirmed} onChange={(event) => setReviewIdentity(event.target.checked && campaign && draft ? { revision: campaign.revision, draft, previewState } : null)} /><span>Saya telah meninjau preview terbaru, harga, produk, promo, dan logo.</span></label>
          <div className="fnb-actions"><button className="fnb-button" type="button" disabled={!canApprove || !reviewConfirmed || !!busy || detail.campaign.approvedRevision === detail.campaign.revision} onClick={() => void approve()}>{busy === "approve" ? "Menyetujui..." : detail.campaign.approvedRevision === detail.campaign.revision ? "Revisi ini disetujui" : "Setujui revisi ini"}</button><button className="fnb-button fnb-primary" type="button" disabled={!canApprove || detail.campaign.approvedRevision !== detail.campaign.revision || !!busy || activeJobs.some((job) => job.revision === detail.campaign.revision)} onClick={() => void render()}>{busy === "render" ? "Memulai render..." : "Render MP4"}</button></div>
          {!canApprove && <p className="fnb-note">{draft ? "Simpan perubahan, pilih preview terbaru, dan selesaikan error validasi sebelum approval." : "Buat storyboard & style dari brief sebelum meninjau preview dan menyetujui video."}</p>}
        </section>
        <section className="fnb-panel"><div className="fnb-preview-title"><h2>Hasil render</h2><button type="button" className="fnb-button" disabled={!!busy} onClick={() => { setBusy("status"); void refreshMetadata().catch(fail).finally(() => setBusy(null)); }}>Muat status</button></div>
          {!detail.renderJobs.length && <p className="fnb-note">Belum ada render. Setujui preview terbaru sebelum membuat MP4.</p>}
          {detail.renderJobs.map((job) => <article className="fnb-render-job" key={job.id}><h3>Revisi {job.revision}</h3><p role="status">{job.status === "queued" ? "Dalam antrean" : job.status === "rendering" ? "Sedang merender MP4..." : job.status === "completed" ? "MP4 siap diunduh" : "Render gagal"}</p>{job.error && <p className="fnb-error">{job.error}</p>}{job.status === "completed" && <button type="button" className="fnb-button" disabled={!!busy} onClick={() => void download(job)}>Unduh MP4 revisi {job.revision}</button>}{job.status === "failed" && <><button type="button" className="fnb-button" disabled={!!busy || previewRevision !== job.revision || !previewState.ready || previewState.revision !== job.revision || (job.revision === detail.campaign.revision && !canApprove)} onClick={() => void render(job)}>Coba render lagi</button>{previewRevision !== job.revision && <p className="fnb-note">Pilih preview revisi {job.revision} untuk mencoba render ini lagi.</p>}</>}</article>)}
        </section>
      </div>
    </div>
  </section>;
}
