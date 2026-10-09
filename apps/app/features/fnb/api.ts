import { z } from "zod";
import { assetSchema, campaignSchema, draftSchema, revisionSchema, styleSchema } from "./recovery";
import type { CampaignBrief, CampaignDraft } from "./types";

const campaignVersionSchema = z.object({
  revision: revisionSchema, draft: draftSchema, compositionHtml: z.string().nullable(),
  compositionHash: z.string().nullable(), validated: z.boolean(), approvedAt: z.string().nullable(),
});

const renderJobSchema = z.object({
  id: z.string().uuid(), campaignId: z.string().uuid(), revision: revisionSchema,
  idempotencyKey: z.string().min(8).max(200),
  status: z.enum(["queued", "rendering", "completed", "failed"]),
  error: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});

const stylePresetSchema = z.object({ id: z.string(), label: z.string(), tokens: styleSchema });

export type StylePreset = z.infer<typeof stylePresetSchema>;

export const campaignListResponseSchema = z.object({ campaigns: z.array(campaignSchema) });

export const campaignResponseSchema = z.object({ campaign: campaignSchema });

export const campaignDetailResponseSchema = z.object({
  campaign: campaignSchema, assets: z.array(assetSchema),
  versions: z.array(campaignVersionSchema), renderJobs: z.array(renderJobSchema),
});

export const stylePresetsResponseSchema = z.object({ presets: z.array(stylePresetSchema) });

export const campaignAssetResponseSchema = z.object({ asset: assetSchema });

export const renderJobResponseSchema = z.object({ job: renderJobSchema });

export const compositionResponseSchema = z.object({ html: z.string() });

export const downloadResponseSchema = z.object({ url: z.string().url().regex(/^https?:\/\//i) });

const errorResponseSchema = z.object({ error: z.string() });

export const campaignFailureSchema = z.instanceof(Error).catch(() => new Error("Permintaan gagal. Draft tetap tersedia."));

type CampaignRequestBody = FormData | { title: string } | { brief: CampaignBrief; expectedRevision: number }
  | { draft: CampaignDraft; expectedRevision: number } | { expectedRevision: number }
  | { revision: number; idempotencyKey: string };

type CampaignRequestOptions = { method?: "GET" | "POST" | "PUT"; body?: CampaignRequestBody; signal?: AbortSignal };

export class CampaignRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function campaignRequest<T>(path: string, schema: z.ZodType<T>, options: CampaignRequestOptions = {}): Promise<T> {
  const body = options.body;
  const isUpload = body instanceof FormData;

  const response = await fetch(`/api/fnb-campaigns${path}`, {
    method: options.method ?? "GET", credentials: "same-origin", cache: "no-store", signal: options.signal,
    headers: body !== undefined && !isUpload ? { "content-type": "application/json" } : undefined,
    body: body === undefined ? undefined : isUpload ? body : JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(payload);
    const message = parsed.success ? parsed.data.error : "Permintaan gagal. Coba lagi tanpa menutup draft.";
    throw new CampaignRequestError(message, response.status);
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) throw new CampaignRequestError("Respons campaign tidak valid. Draft tetap tersedia; coba lagi.", response.status);

  return parsed.data;
}
