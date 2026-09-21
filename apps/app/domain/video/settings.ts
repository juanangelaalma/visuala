import type {
  VideoAspectRatio,
  VideoDurationSeconds,
  VideoProjectStatus,
  VideoRenderJobStatus,
  VideoResolution,
  VideoStyleId,
  VideoType,
} from "./types";

export const VIDEO_TYPES = ["product_promo", "discount_promo", "product_launch", "menu_showcase"] as const satisfies readonly VideoType[];
export const VIDEO_DURATIONS_SECONDS = [6, 10, 15] as const satisfies readonly VideoDurationSeconds[];
export const VIDEO_ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const satisfies readonly VideoAspectRatio[];
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const satisfies readonly VideoResolution[];
export const VIDEO_STYLE_IDS = ["bold_pop", "clean_product", "warm_artisan", "premium_dark"] as const satisfies readonly VideoStyleId[];
export const VIDEO_LANGUAGES = ["id", "en"] as const;

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
  product_promo: "Promosi produk",
  discount_promo: "Diskon dan promo harga",
  product_launch: "Peluncuran produk",
  menu_showcase: "Menu dan etalase",
};

export const PROJECT_STATUS_LABELS: Record<VideoProjectStatus, string> = {
  draft: "Draft",
  interviewing: "Menyusun brief",
  awaiting_approval: "Menunggu persetujuan",
  approved: "Disetujui",
  rendering: "Sedang dirender",
  ready: "Siap",
  revision_draft: "Draft revisi",
  moderation_blocked: "Diblokir moderasi",
  failed: "Gagal",
  deleted: "Dihapus",
};

export const RENDER_JOB_STATUS_LABELS: Record<VideoRenderJobStatus, string> = {
  queued: "Dalam antrean",
  preparing: "Menyiapkan",
  rendering: "Merender",
  uploading: "Mengunggah",
  succeeded: "Selesai",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

export const VIDEO_LANGUAGE_LABELS: Record<string, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

export type VideoStylePreset = {
  id: VideoStyleId;
  label: string;
  description: string;
  swatch: readonly [string, string];
};

export const VIDEO_STYLE_PRESETS: readonly VideoStylePreset[] = [
  { id: "bold_pop", label: "Bold Pop", description: "Warna tebal, kontras tinggi, dan gerak cepat.", swatch: ["#EFF31B", "#050505"] },
  { id: "clean_product", label: "Clean Product", description: "Latar bersih dengan fokus penuh pada produk.", swatch: ["#F3F3EF", "#B9C4CC"] },
  { id: "warm_artisan", label: "Warm Artisan", description: "Nuansa hangat dan tekstur lembut.", swatch: ["#D99A62", "#5B2E1B"] },
  { id: "premium_dark", label: "Premium Dark", description: "Latar gelap dan aksen elegan.", swatch: ["#D7C39A", "#171717"] },
];

export function durationLabel(seconds: VideoDurationSeconds): string {
  return `${seconds} detik`;
}

export function videoTypeLabel(videoType: VideoType): string {
  return VIDEO_TYPE_LABELS[videoType];
}

export function projectStatusLabel(status: VideoProjectStatus): string {
  return PROJECT_STATUS_LABELS[status];
}

export function languageLabel(language: string): string {
  return VIDEO_LANGUAGE_LABELS[language] ?? language;
}

/**
 * The 18 duration x ratio x resolution combinations the backend currently accepts. The HyperFrames
 * spike that would prove them never ran, so this mirrors what the API takes rather than a verified
 * render matrix. See apps/app/docs/notes/video-backend-backlog.md before trimming it.
 */
export function isRenderCombinationSupported(settings: {
  durationSeconds: VideoDurationSeconds;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
}): boolean {
  return (
    (VIDEO_DURATIONS_SECONDS as readonly number[]).includes(settings.durationSeconds) &&
    (VIDEO_ASPECT_RATIOS as readonly string[]).includes(settings.aspectRatio) &&
    (VIDEO_RESOLUTIONS as readonly string[]).includes(settings.resolution)
  );
}
