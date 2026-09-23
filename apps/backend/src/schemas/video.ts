import { z } from "zod";
import type { AssetMimeType } from "@/domain/ai-service/assets";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, VIDEO_STYLE_IDS, VIDEO_TYPES } from "@/domain/video/settings";

/** The content types an asset upload may declare; the bytes themselves are validated separately. */
export const VIDEO_ASSET_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const satisfies readonly AssetMimeType[];

export const outputSettingsBodySchema = z.object({
  durationSeconds: z.union([z.literal(6), z.literal(10), z.literal(15)]),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  language: z.string().trim().min(2).max(12),
  voiceOverEnabled: z.boolean(),
  musicEnabled: z.boolean(),
}).strict();

export const createVideoProjectBodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  videoType: z.enum(VIDEO_TYPES),
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsBodySchema,
}).strict();

export type CreateVideoProjectBody = z.infer<typeof createVideoProjectBodySchema>;
