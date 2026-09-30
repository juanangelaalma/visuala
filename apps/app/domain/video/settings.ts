import type {
  VideoAspectRatio,
  VideoDurationSeconds,
  VideoProjectStatus,
  VideoRenderJobStatus,
  VideoResolution,
  VideoStyleId,
  VideoType,
} from "./types";

export const VIDEO_TYPES = ["product_promo", "discount_promo", "product_launch", "menu_showcase", "storefront_showcase"] as const satisfies readonly VideoType[];

/** The backend accepts any whole number of seconds in this range. 4-30 are the offers the form shows. */
export const VIDEO_MIN_DURATION_SECONDS = 4;
export const VIDEO_MAX_DURATION_SECONDS = 30;
export const VIDEO_DURATION_OPTIONS = [6, 10, 12, 15, 20, 30] as const;
export const VIDEO_ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const satisfies readonly VideoAspectRatio[];
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const satisfies readonly VideoResolution[];
export const VIDEO_STYLE_IDS = ["creative-mode"] as const satisfies readonly VideoStyleId[];
export const VIDEO_LANGUAGES = ["id", "en"] as const;

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
  product_promo: "Promosi produk",
  discount_promo: "Diskon dan promo harga",
  product_launch: "Peluncuran produk",
  menu_showcase: "Menu dan etalase",
  storefront_showcase: "Tempat dan lokasi",
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
  { id: "creative-mode", label: "Creative Mode", description: "Poster editorial: warna blok tebal, huruf besar, garis tegas.", swatch: ["#EFE9D9", "#0F0F0F"] },
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
