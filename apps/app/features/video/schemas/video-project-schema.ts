import { z } from "zod";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_LANGUAGES,
  VIDEO_RESOLUTIONS,
  VIDEO_STYLE_IDS,
  VIDEO_TYPES,
} from "@/domain/video/settings";
import type { VideoAssetMimeType } from "@/domain/video/types";

/** Mirrors the backend asset limits in `apps/backend/src/domain/video/limits.ts` and `MAX_ASSET_BYTES`. */
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_ASSETS_PER_PROJECT = 8;
export const MAX_PROJECT_ASSET_BYTES = 40 * 1024 * 1024;
export const MIN_IMAGE_DIMENSION = 200;

export const VIDEO_ASSET_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const satisfies readonly VideoAssetMimeType[];

export function isSupportedAssetMimeType(value: string): value is VideoAssetMimeType {
  return (VIDEO_ASSET_MIME_TYPES as readonly string[]).includes(value);
}

export const outputSettingsSchema = z
  .object({
    durationSeconds: z.union([z.literal(6), z.literal(10), z.literal(15)]),
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
    resolution: z.enum(VIDEO_RESOLUTIONS),
    language: z.string().trim().min(2).max(12),
    voiceOverEnabled: z.boolean(),
    musicEnabled: z.boolean(),
  })
  .strict();

export const createVideoProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    videoType: z.enum(VIDEO_TYPES),
    styleId: z.enum(VIDEO_STYLE_IDS),
    settings: outputSettingsSchema,
  })
  .strict();

/** Browser state supplies booleans while native form data supplies strings; `z.coerce.boolean()` would read the string "false" as `true`. */
const booleanField = z
  .union([z.literal(true), z.literal(false), z.literal("true"), z.literal("false")])
  .transform((value) => value === true || value === "true");

/** The flat shape the setup form submits. Coerces the number and boolean fields the browser sends as strings. */
export const videoProjectFormSchema = z
  .object({
    title: z.string().trim().min(1, "Judul video wajib diisi.").max(120, "Judul maksimal 120 karakter."),
    videoType: z.enum(VIDEO_TYPES, { message: "Pilih tipe video." }),
    styleId: z.enum(VIDEO_STYLE_IDS, { message: "Pilih style video." }),
    durationSeconds: z.coerce.number().pipe(z.union([z.literal(6), z.literal(10), z.literal(15)])),
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
    resolution: z.enum(VIDEO_RESOLUTIONS),
    language: z
      .string()
      .trim()
      .refine((value) => (VIDEO_LANGUAGES as readonly string[]).includes(value), "Pilih bahasa yang didukung."),
    voiceOverEnabled: booleanField,
    musicEnabled: booleanField,
  })
  .strict();

export type CreateVideoProjectInput = z.infer<typeof createVideoProjectSchema>;
export type VideoProjectFormInput = z.infer<typeof videoProjectFormSchema>;
