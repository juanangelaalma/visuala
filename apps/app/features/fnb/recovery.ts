import { z } from "zod";
import type { Campaign, CampaignAsset, CampaignBrief, CampaignDraft } from "./types";

// Recovery accepts unfinished fields; server validation still gates saves and approval.
const briefSchema = z.object({
  campaignName: z.string(), productName: z.string(), brandName: z.string(),
  originalPrice: z.number().finite(), discountPercent: z.number().finite(),
  promoPeriod: z.string(), cta: z.string(),
  productAssetId: z.union([z.string().uuid(), z.literal("")]),
  logoAssetId: z.string().uuid().nullable(),
});

const sceneContentSchema = z.object({
  headline: z.string(), subheadline: z.string(), cta: z.string(), productAssetId: z.string().uuid(),
});

const planSchema = z.object({ scenes: z.tuple([
  sceneContentSchema.extend({ id: z.literal("hook"), type: z.literal("hook"), start: z.literal(0), duration: z.literal(2) }),
  sceneContentSchema.extend({ id: z.literal("product"), type: z.literal("product"), start: z.literal(2), duration: z.literal(4) }),
  sceneContentSchema.extend({ id: z.literal("discount"), type: z.literal("discount"), start: z.literal(6), duration: z.literal(5) }),
  sceneContentSchema.extend({ id: z.literal("end-card"), type: z.literal("end-card"), start: z.literal(11), duration: z.literal(4) }),
]) });

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const styleSchema = z.object({
  primary: colorSchema, secondary: colorSchema, accent: colorSchema, background: colorSchema, text: colorSchema,
  typography: z.enum(["bold", "editorial", "clean"]),
  backgroundTreatment: z.enum(["solid", "radial"]), density: z.enum(["balanced", "bold"]),
});

export const draftSchema = z.object({
  brief: briefSchema,
  plan: planSchema,
  style: styleSchema,
});

export const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const campaignSchema = z.object({
  id: z.string().uuid(), title: z.string(), revision: revisionSchema,
  status: z.enum(["draft", "approved", "rendering", "completed", "failed"]),
  draft: draftSchema.nullable(), initialPlan: planSchema.nullable(), compositionRevision: revisionSchema.nullable(),
  compositionHash: z.string().nullable(), validationErrors: z.array(z.string()), approvedRevision: revisionSchema.nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});

export const assetSchema = z.object({
  id: z.string().uuid(), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive(), height: z.number().int().positive(),
  previewUrl: z.string().url().regex(/^https?:\/\//i),
});

export type EditorRecovery = { revision: number; draft: CampaignDraft | null; brief: CampaignBrief };

export type CreationRecovery = { brief: CampaignBrief; campaign: Campaign | null; assets: CampaignAsset[] };

export const editorRecoverySchema: z.ZodType<EditorRecovery> = z.object({ revision: revisionSchema, draft: draftSchema.nullable(), brief: briefSchema });

export const creationRecoverySchema: z.ZodType<CreationRecovery> = z.object({ brief: briefSchema, campaign: campaignSchema.nullable(), assets: z.array(assetSchema) });

export function readRecovery<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const stored = sessionStorage.getItem(key);

    if (!stored) return null;
    const parsed = schema.safeParse(JSON.parse(stored));

    return parsed.success ? parsed.data : null;
  } catch {
    // Browser storage is optional; persisted server versions remain authoritative.
    return null;
  }
}
