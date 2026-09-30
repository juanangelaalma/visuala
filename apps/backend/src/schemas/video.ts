import { z } from "zod";
import type { AssetMimeType } from "@/domain/ai-service/assets";
import { VIDEO_STYLE_IDS, VIDEO_TYPES, outputSettingsSchema } from "@/domain/video/settings";

/** The content types an asset upload may declare; the bytes themselves are validated separately. */
export const VIDEO_ASSET_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const satisfies readonly AssetMimeType[];

/** The request reuses the domain schema rather than restating it: a second copy is how the two drift apart. */
export const outputSettingsBodySchema = outputSettingsSchema;

export const createVideoProjectBodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  videoType: z.enum(VIDEO_TYPES),
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsBodySchema,
}).strict();

export type CreateVideoProjectBody = z.infer<typeof createVideoProjectBodySchema>;
