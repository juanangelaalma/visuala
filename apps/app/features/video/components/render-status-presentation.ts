import { RENDER_JOB_STATUS_LABELS } from "@/domain/video/settings";
import type { VideoRenderJob, VideoRenderJobStatus } from "@/domain/video/types";

const ACTIVE_STATUSES: readonly VideoRenderJobStatus[] = ["queued", "preparing", "rendering", "uploading"];

const FAILURE_DETAILS: Readonly<Record<string, string>> = {
  render_timeout: "Render terlalu lama dan dihentikan. Coba lagi, atau pilih durasi yang lebih pendek.",
  render_stale: "Render terputus sebelum selesai. Proyek sudah bisa dirender ulang.",
  render_engine_failed: "Mesin render gagal membuat video. Coba lagi sebentar lagi.",
  render_engine_unavailable: "Mesin render sedang tidak tersedia di server ini.",
  render_upload_failed: "Hasil render gagal diunggah. Proyek sudah bisa dirender ulang.",
  render_output_too_large: "Hasil render lebih besar dari batas penyimpanan proyek.",
  render_output_invalid: "Hasil render tidak sesuai pengaturan proyek, jadi tidak dipublikasikan.",
  render_asset_mutated: "Salah satu foto berubah setelah persetujuan. Unggah ulang foto itu lalu render lagi.",
  render_asset_missing: "Salah satu foto sudah tidak ada. Unggah ulang lalu render lagi.",
  render_input_unsupported: "Render ini dibuat oleh versi aplikasi yang berbeda. Buat render baru.",
  render_worker_shutdown: "Server render dimulai ulang. Proyek sudah bisa dirender ulang.",
};

export type RenderStatusPresentation = { label: string; detail: string | null };

/** In flight means the panel should keep polling and keep the cancel control available. */
export function isJobActive(job: Pick<VideoRenderJob, "status">): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

/**
 * An unrecognised error code yields no detail rather than the raw code: the code is a machine
 * contract, and a user reading `render_weird` learns nothing and leaks the shape of the backend.
 */
export function renderStatusPresentation(job: Pick<VideoRenderJob, "status" | "errorCode">): RenderStatusPresentation {
  return {
    label: RENDER_JOB_STATUS_LABELS[job.status],
    detail: job.errorCode ? FAILURE_DETAILS[job.errorCode] ?? null : null,
  };
}

/**
 * The player's box has to match the file it holds. A single portrait box would stretch a 1:1 or a
 * 16:9 render, and the settings screen offers all three, so each ratio gets its own.
 */
export function videoAspectClass(aspectRatio: string): string {
  switch (aspectRatio) {
    case "1:1":
      return "aspect-square";
    case "16:9":
      return "aspect-video";
    default:
      return "aspect-[9/16]";
  }
}
