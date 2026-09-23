"use client";

import { Button } from "@visuala/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from "react";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS_SECONDS,
  VIDEO_LANGUAGES,
  VIDEO_LANGUAGE_LABELS,
  VIDEO_RESOLUTIONS,
  VIDEO_STYLE_PRESETS,
  VIDEO_TYPES,
  VIDEO_TYPE_LABELS,
  durationLabel,
} from "@/domain/video/settings";
import type { VideoAspectRatio, VideoDurationSeconds, VideoResolution, VideoStyleId, VideoType } from "@/domain/video/types";
import { BrowserApiError, browserApiErrorMessage } from "@/lib/api/browser-client";
import { videoApi } from "../api/video-api";
import {
  type CreateVideoProjectInput,
  MAX_ASSET_BYTES,
  MAX_ASSETS_PER_PROJECT,
  MAX_PROJECT_ASSET_BYTES,
  VIDEO_ASSET_MIME_TYPES,
  isSupportedAssetMimeType,
  videoProjectFormSchema,
} from "../schemas/video-project-schema";

type Draft = { id: string; file: File; previewUrl: string };
type UploadEntry = { id: string; name: string; state: "pending" | "uploading" | "done" | "failed"; error?: string };
type VideoApiClient = Pick<typeof videoApi, "createProject" | "uploadAsset">;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const inputClassName = `h-12 w-full rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-primary ${focusRing}`;

const uploadStateLabels: Record<UploadEntry["state"], string> = {
  pending: "Menunggu",
  uploading: "Mengunggah",
  done: "Selesai",
  failed: "Gagal",
};

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function OptionGroup<T extends string | number>({ legend, options, value, onChange }: { legend: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold text-white">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-10 flex-1 rounded-2xl border px-3 text-sm font-medium transition-colors ${focusRing} ${
              value === option.value ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-pricing-bg text-white hover:border-white/25"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex min-h-14 items-center justify-between rounded-2xl border border-white/10 bg-pricing-bg px-4 text-sm font-semibold text-white ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className={`size-5 accent-primary ${focusRing}`} />
    </label>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-7">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-neutral-450">{description}</p>
      <div className="mt-5 space-y-6">{children}</div>
    </section>
  );
}

export function VideoSetupForm({ api = videoApi }: { api?: VideoApiClient }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [videoType, setVideoType] = useState<VideoType>(VIDEO_TYPES[0]);
  const [styleId, setStyleId] = useState<VideoStyleId>(VIDEO_STYLE_PRESETS[0].id);
  const [durationSeconds, setDurationSeconds] = useState<VideoDurationSeconds>(VIDEO_DURATIONS_SECONDS[1]);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(VIDEO_ASPECT_RATIOS[0]);
  const [resolution, setResolution] = useState<VideoResolution>(VIDEO_RESOLUTIONS[1]);
  const [language, setLanguage] = useState<string>(VIDEO_LANGUAGES[0]);
  const [voiceOverEnabled, setVoiceOverEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [busy, setBusy] = useState<"creating" | "uploading" | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const draftsRef = useRef<Draft[]>([]);
  const submissionControllerRef = useRef<AbortController | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => () => {
    submissionControllerRef.current?.abort();
    for (const draft of draftsRef.current) URL.revokeObjectURL(draft.previewUrl);
  }, []);

  const busyNow = busy !== null;
  const failedUploads = uploads.filter((upload) => upload.state === "failed");

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const accepted: Draft[] = [];
    const problems: string[] = [];
    let count = drafts.length;
    let totalBytes = drafts.reduce((sum, draft) => sum + draft.file.size, 0);

    for (const file of incoming) {
      if (!isSupportedAssetMimeType(file.type)) {
        problems.push(`${file.name}: format harus JPEG, PNG, atau WebP.`);
        continue;
      }
      if (file.size > MAX_ASSET_BYTES) {
        problems.push(`${file.name}: ukuran melebihi ${formatMegabytes(MAX_ASSET_BYTES)}.`);
        continue;
      }
      if (count >= MAX_ASSETS_PER_PROJECT) {
        problems.push(`Maksimal ${MAX_ASSETS_PER_PROJECT} gambar per proyek.`);
        break;
      }
      if (totalBytes + file.size > MAX_PROJECT_ASSET_BYTES) {
        problems.push(`Total gambar melebihi ${formatMegabytes(MAX_PROJECT_ASSET_BYTES)}.`);
        break;
      }
      count += 1;
      totalBytes += file.size;
      accepted.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
    }

    if (accepted.length > 0) setDrafts((current) => [...current, ...accepted]);
    setError(problems.join(" "));
  }

  function removeDraft(id: string) {
    setDrafts((current) => {
      const target = current.find((draft) => draft.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((draft) => draft.id !== id);
    });
    setUploads((current) => current.filter((upload) => upload.id !== id));
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    if (busyNow) return;
    addFiles(event.dataTransfer.files);
  }

  function createProjectInput(): CreateVideoProjectInput | null {
    const parsed = videoProjectFormSchema.safeParse({ title, videoType, styleId, durationSeconds, aspectRatio, resolution, language, voiceOverEnabled, musicEnabled });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Periksa kembali pengaturan video.");
      return null;
    }

    return {
      title: parsed.data.title,
      videoType: parsed.data.videoType,
      styleId: parsed.data.styleId,
      settings: {
        durationSeconds: parsed.data.durationSeconds,
        aspectRatio: parsed.data.aspectRatio,
        resolution: parsed.data.resolution,
        language: parsed.data.language,
        voiceOverEnabled: parsed.data.voiceOverEnabled,
        musicEnabled: parsed.data.musicEnabled,
      },
    };
  }

  function handleRequestError(requestError: unknown, fallback: string) {
    setError(browserApiErrorMessage(requestError, fallback));
    setNeedsLogin(requestError instanceof BrowserApiError && requestError.status === 401);
  }

  async function uploadDrafts(targetProjectId: string, entries: Draft[], signal: AbortSignal): Promise<boolean> {
    let allSucceeded = true;

    for (const entry of entries) {
      if (signal.aborted) return false;

      setUploads((current) => current.map((upload) => (upload.id === entry.id ? { ...upload, state: "uploading", error: undefined } : upload)));

      try {
        await api.uploadAsset(targetProjectId, entry.file, entry.file.type, signal);
      } catch (requestError) {
        if (signal.aborted) return false;

        allSucceeded = false;
        const uploadError = browserApiErrorMessage(requestError, "Tidak dapat mengunggah gambar.");
        setUploads((current) => current.map((upload) => (upload.id === entry.id ? { ...upload, state: "failed", error: uploadError } : upload)));
        if (requestError instanceof BrowserApiError && requestError.status === 401) setNeedsLogin(true);
        continue;
      }

      if (signal.aborted) return false;

      setUploads((current) => current.map((upload) => (upload.id === entry.id ? { ...upload, state: "done", error: undefined } : upload)));
    }

    return allSucceeded;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNeedsLogin(false);

    if (!rightsConfirmed) {
      setError("Konfirmasikan hak penggunaan aset untuk melanjutkan.");
      return;
    }

    const input = createProjectInput();
    if (!input) return;

    setUploads(drafts.map((draft) => ({ id: draft.id, name: draft.file.name, state: "pending" })));
    setBusy("creating");

    const controller = new AbortController();
    submissionControllerRef.current?.abort();
    submissionControllerRef.current = controller;
    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;

    let createdProjectId: string;
    try {
      const created = await api.createProject(input, idempotencyKey, controller.signal);
      if (controller.signal.aborted) return;
      createdProjectId = created.project.id;
      idempotencyKeyRef.current = null;
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setBusy(null);
      handleRequestError(requestError, "Tidak dapat membuat proyek video.");
      if (requestError instanceof BrowserApiError && requestError.status >= 400 && requestError.status < 500) idempotencyKeyRef.current = null;
      return;
    }

    setProjectId(createdProjectId);

    let allSucceeded = true;
    if (drafts.length > 0) {
      setBusy("uploading");
      allSucceeded = await uploadDrafts(createdProjectId, drafts, controller.signal);
    }

    if (controller.signal.aborted) return;
    setBusy(null);

    if (allSucceeded) {
      router.push(`/dashboard/videos/${encodeURIComponent(createdProjectId)}`);
      return;
    }

    setError("Sebagian gambar gagal diunggah. Periksa file yang gagal atau buka ruang kerja proyek.");
  }

  async function handleRetryUploads() {
    if (!projectId) return;
    const retryable = drafts.filter((draft) => failedUploads.some((upload) => upload.id === draft.id));
    if (retryable.length === 0) return;

    setError("");
    setNeedsLogin(false);
    setBusy("uploading");
    const controller = new AbortController();
    submissionControllerRef.current?.abort();
    submissionControllerRef.current = controller;
    const allSucceeded = await uploadDrafts(projectId, retryable, controller.signal);
    if (controller.signal.aborted) return;
    setBusy(null);

    if (allSucceeded) {
      router.push(`/dashboard/videos/${encodeURIComponent(projectId)}`);
      return;
    }

    setError("Sebagian gambar gagal diunggah. Periksa file yang gagal atau buka ruang kerja proyek.");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
      <div className="space-y-6">
        <header>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Video baru</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-white">Atur hasil yang Anda butuhkan</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-450">Pilihan ini membantu AI menyusun brief dan menjaga setiap versi tetap konsisten.</p>
        </header>

        <Panel title="Detail video" description="Judul dan tipe menentukan pertanyaan yang akan diajukan AI.">
          <div>
            <label htmlFor="video-title" className="mb-2 block text-xs font-semibold text-white">
              Judul video
            </label>
            <input id="video-title" name="title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Misal: Es Kopi Gula Aren" className={inputClassName} />
          </div>
          <OptionGroup
            legend="Tipe video"
            value={videoType}
            onChange={setVideoType}
            options={VIDEO_TYPES.map((type) => ({ value: type, label: VIDEO_TYPE_LABELS[type] }))}
          />
        </Panel>

        <Panel title="Format output" description="Kombinasi durasi, rasio, dan resolusi yang dipakai saat render.">
          <OptionGroup
            legend="Durasi"
            value={durationSeconds}
            onChange={setDurationSeconds}
            options={VIDEO_DURATIONS_SECONDS.map((seconds) => ({ value: seconds, label: durationLabel(seconds) }))}
          />
          <OptionGroup
            legend="Rasio"
            value={aspectRatio}
            onChange={setAspectRatio}
            options={VIDEO_ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
          />
          <OptionGroup
            legend="Resolusi"
            value={resolution}
            onChange={setResolution}
            options={VIDEO_RESOLUTIONS.map((value) => ({ value, label: value }))}
          />
        </Panel>

        <Panel title="Style visual" description="Pilih satu preset. Anda masih bisa menggantinya melalui chat sebelum approval.">
          <fieldset>
            <legend className="sr-only">Style video</legend>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {VIDEO_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={styleId === preset.id}
                  onClick={() => setStyleId(preset.id)}
                  className={`min-h-24 rounded-2xl border p-3 text-left transition-colors ${focusRing} ${
                    styleId === preset.id ? "border-primary bg-primary/10" : "border-white/10 bg-pricing-bg hover:border-white/25"
                  }`}
                >
                  <span className="flex h-4 gap-1">
                    <i className="flex-1 rounded-sm" style={{ background: preset.swatch[0] }} />
                    <i className="flex-1 rounded-sm" style={{ background: preset.swatch[1] }} />
                  </span>
                  <strong className={`mt-2 block text-sm ${styleId === preset.id ? "text-primary" : "text-white"}`}>{preset.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-neutral-450">{preset.description}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </Panel>

        <Panel title="Suara dan caption" description="Voice-over dan musik aktif secara default dan dapat dimatikan.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle label="Voice-over" checked={voiceOverEnabled} onChange={setVoiceOverEnabled} />
            <Toggle label="Musik latar" checked={musicEnabled} onChange={setMusicEnabled} />
          </div>
          <div>
            <label htmlFor="video-language" className="mb-2 block text-xs font-semibold text-white">
              Bahasa voice-over
            </label>
            <select id="video-language" value={language} onChange={(event) => setLanguage(event.target.value)} className={`${inputClassName} appearance-none`}>
              {VIDEO_LANGUAGES.map((code) => (
                <option key={code} value={code} className="bg-black text-white">
                  {VIDEO_LANGUAGE_LABELS[code] ?? code}
                </option>
              ))}
            </select>
          </div>
        </Panel>
      </div>

      <aside className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-7 xl:sticky xl:top-8">
        <h2 className="text-lg font-semibold text-white">Foto produk</h2>
        <p className="mt-1 text-sm leading-5 text-neutral-450">
          JPEG, PNG, atau WebP. Maksimal {MAX_ASSETS_PER_PROJECT} gambar, {formatMegabytes(MAX_ASSET_BYTES)} per gambar, {formatMegabytes(MAX_PROJECT_ASSET_BYTES)} total.
        </p>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            if (!busyNow) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`mt-4 grid min-h-40 place-items-center rounded-2xl border border-dashed p-5 text-center transition-colors ${focusRing} ${
            dragOver ? "border-primary bg-primary/5" : "border-white/20 bg-black"
          } ${busyNow ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary"}`}
        >
          <span>
            <span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-full bg-primary/15 text-primary">
              ▧
            </span>
            <strong className="mt-3 block text-sm text-white">Pilih foto produk</strong>
            <span className="mt-1 block text-[10px] uppercase tracking-wide text-neutral-500">JPEG, PNG, WEBP</span>
          </span>
          <input type="file" accept={VIDEO_ASSET_MIME_TYPES.join(",")} multiple disabled={busyNow} onChange={handleFileInput} className="sr-only" />
        </label>

        {drafts.length > 0 ? (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {drafts.map((draft) => {
              const upload = uploads.find((entry) => entry.id === draft.id);
              return (
                <li key={draft.id} className="relative">
                  {/* Object URLs from the selected file; the backend preview comes later from a signed URL. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.previewUrl} alt={draft.file.name} className="aspect-square w-full rounded-xl object-cover outline outline-1 outline-white/10" />
                  {upload ? (
                    <span
                      className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                        upload.state === "failed" ? "bg-danger/80 text-white" : upload.state === "done" ? "bg-primary text-black" : "bg-black/80 text-primary"
                      }`}
                    >
                      {uploadStateLabels[upload.state]}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeDraft(draft.id)}
                      aria-label={`Hapus ${draft.file.name}`}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/80 text-sm text-white hover:bg-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {failedUploads.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {failedUploads.map((upload) => (
              <li key={upload.id} role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-white">
                {upload.name}: {upload.error}
              </li>
            ))}
          </ul>
        ) : null}

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-xs leading-5 text-neutral-300">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            disabled={busyNow}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
            aria-invalid={error.length > 0}
            className={`mt-0.5 size-5 shrink-0 accent-primary ${focusRing}`}
          />
          <span>Saya memiliki hak untuk menggunakan semua aset yang diunggah.</span>
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
            {error}
          </p>
        ) : null}

        {needsLogin ? (
          <a href="/login" className={`mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4 ${focusRing}`}>
            Masuk
          </a>
        ) : null}

        {failedUploads.length > 0 && projectId ? (
          <a href={`/dashboard/videos/${encodeURIComponent(projectId)}`} className={`mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4 ${focusRing}`}>
            Buka ruang kerja proyek
          </a>
        ) : null}

        {failedUploads.length > 0 ? (
          <Button type="button" variant="primary" tone="dark" disabled={busyNow} onClick={handleRetryUploads} className="mt-5 h-12 w-full px-5 py-0 text-sm font-semibold">
            {busy === "uploading" ? "Mengunggah..." : "Coba unggah lagi"}
          </Button>
        ) : (
          <Button type="submit" variant="primary" tone="dark" disabled={busyNow} aria-disabled={busyNow} className="mt-5 h-12 w-full px-5 py-0 text-sm font-semibold">
            {busy === "creating" ? "Membuat proyek..." : busy === "uploading" ? "Mengunggah foto..." : "Lanjut ke percakapan"}
          </Button>
        )}

        <p className="mt-3 text-center text-[10px] text-neutral-500">AI hanya memakai fakta yang Anda konfirmasi.</p>
      </aside>
    </form>
  );
}
