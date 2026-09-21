import { z } from "zod";
import { VideoError } from "./errors";
import { assertRenderCombinationSupported } from "./render-compatibility";
import type { VideoAspectRatio, VideoDurationSeconds, VideoOutputSettings, VideoResolution, VideoStyleId } from "./types";

export const VIDEO_TYPES = ["product_promo", "discount_promo", "product_launch", "menu_showcase"] as const;
export const videoTypeSchema = z.enum(VIDEO_TYPES);
export const VIDEO_DURATIONS_SECONDS = [6, 10, 15] as const;
export const VIDEO_ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
export const VIDEO_STYLE_IDS = ["bold_pop", "clean_product", "warm_artisan", "premium_dark"] as const;

/** Languages the TTS decision record confirmed. Update from docs/decisions/2026-09-21-media-providers.md only. */
export const VIDEO_LANGUAGES = ["id", "en"] as const;

export const VIDEO_STYLE_PRESETS: readonly { id: VideoStyleId; label: string; description: string }[] = [
  { id: "bold_pop", label: "Bold Pop", description: "Warna tebal, kontras tinggi, dan gerak cepat untuk promo yang mencolok." },
  { id: "clean_product", label: "Clean Product", description: "Latar bersih dan fokus penuh pada produk, cocok untuk katalog." },
  { id: "warm_artisan", label: "Warm Artisan", description: "Nuansa hangat dan tekstur lembut untuk produk rumahan." },
  { id: "premium_dark", label: "Premium Dark", description: "Latar gelap dan aksen elegan untuk kesan eksklusif." },
];

export const outputSettingsSchema = z.object({
  durationSeconds: z.union([z.literal(6), z.literal(10), z.literal(15)]),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  language: z.string().trim().min(2).max(12),
  voiceOverEnabled: z.boolean(),
  musicEnabled: z.boolean(),
}).strict();

export function isSupportedLanguage(language: string): boolean {
  return (VIDEO_LANGUAGES as readonly string[]).includes(language);
}

export function validateOutputSettings(input: unknown): VideoOutputSettings {
  const parsed = outputSettingsSchema.safeParse(input);
  if (!parsed.success) throw invalidSettings();
  if (!isSupportedLanguage(parsed.data.language)) throw invalidSettings();
  assertRenderCombinationSupported(parsed.data);
  return parsed.data;
}

function invalidSettings(): VideoError {
  return new VideoError("video_input_invalid", "The video settings are not supported.");
}
