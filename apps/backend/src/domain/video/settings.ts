import { z } from "zod";
import { VideoError } from "./errors";
import type { VideoAspectRatio, VideoDurationSeconds, VideoOutputSettings, VideoResolution, VideoStyleId } from "./types";

/** The five recipes. A recipe is the requirement set of one video type, so this is the one list. */
export const VIDEO_TYPES = ["product_promo", "discount_promo", "product_launch", "menu_showcase", "storefront_showcase"] as const;
export const videoTypeSchema = z.enum(VIDEO_TYPES);
export const VIDEO_MIN_DURATION_SECONDS = 4;
export const VIDEO_MAX_DURATION_SECONDS = 30;
export const VIDEO_ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
export const VIDEO_STYLE_IDS = ["creative-mode"] as const;

/** Languages the TTS decision record confirmed. Update from docs/decisions/2026-09-21-media-providers.md only. */
export const VIDEO_LANGUAGES = ["id", "en"] as const;

export const VIDEO_STYLE_PRESETS: readonly { id: VideoStyleId; label: string; description: string }[] = [
  {
    id: "creative-mode",
    label: "Creative Mode",
    description: "Poster editorial neo-brutalis: warna blok tebal, huruf besar, garis tegas, dan gerak yang pasti.",
  },
];

export const outputSettingsSchema = z.object({
  durationSeconds: z.number().int().min(VIDEO_MIN_DURATION_SECONDS).max(VIDEO_MAX_DURATION_SECONDS),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  language: z.string().trim().min(2).max(12),
  voiceOverEnabled: z.boolean(),
  musicEnabled: z.boolean(),
}).strict();

export function isSupportedLanguage(language: string): boolean {
  return (VIDEO_LANGUAGES as readonly string[]).includes(language);
}

/** The rendered frame size: the named resolution is the short side, and both sides stay even for H.264. */
export function frameDimensions(settings: Pick<VideoOutputSettings, "aspectRatio" | "resolution">): { width: number; height: number } {
  const shortSide = settings.resolution === "1080p" ? 1080 : 720;
  switch (settings.aspectRatio) {
    case "9:16":
      return { width: shortSide, height: (shortSide * 16) / 9 };
    case "1:1":
      return { width: shortSide, height: shortSide };
    case "16:9":
      return { width: (shortSide * 16) / 9, height: shortSide };
  }
}

/**
 * Settings are validated here and nowhere else. Whether the composition fits the frame is the engine's
 * own validator's business, because that depends on the modules and catalog items the plan chose.
 */
export function validateOutputSettings(input: unknown): VideoOutputSettings {
  const parsed = outputSettingsSchema.safeParse(input);
  if (!parsed.success) throw invalidSettings();
  if (!isSupportedLanguage(parsed.data.language)) throw invalidSettings();
  return parsed.data;
}

function invalidSettings(): VideoError {
  return new VideoError("video_input_invalid", "The video settings are not supported.");
}
