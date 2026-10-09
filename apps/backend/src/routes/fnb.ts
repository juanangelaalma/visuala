import { Elysia, t } from "elysia";
import { z } from "zod";
import { approveCampaign, createCampaign, downloadCampaignRender, generateCampaign, getCampaign, getCampaignComposition, getCampaignRenderJob, listCampaigns, renderCampaign, saveCampaignDraft, uploadCampaignAsset } from "@/application/fnb/campaigns";
import { createCampaignServices } from "@/application/fnb/services";
import { MAX_ASSET_BYTES } from "@/domain/ai-service/assets";
import { STYLE_PRESETS, campaignBriefSchema, draftSchema } from "@/domain/fnb/campaign";
import { VideoError } from "@/domain/video/errors";
import { authPlugin } from "@/plugins/supabase";

const createBodySchema = z.object({ title: z.string().trim().min(1).max(120) }).strict();

const revisionSchema = z.number().int().nonnegative();

const generateBodySchema = z.object({ brief: campaignBriefSchema, expectedRevision: revisionSchema }).strict();

const saveBodySchema = z.object({ draft: draftSchema, expectedRevision: revisionSchema }).strict();

const approveBodySchema = z.object({ expectedRevision: revisionSchema }).strict();

const renderBodySchema = z.object({ revision: z.number().int().positive(), idempotencyKey: z.string().trim().min(8).max(200) }).strict();

const jsonBody = { body: t.Unknown() } as const;

const campaignParams = { params: t.Object({ id: t.String({ format: "uuid" }) }) } as const;

const jobParams = { params: t.Object({ id: t.String({ format: "uuid" }), jobId: t.String({ format: "uuid" }) }) } as const;

const invalidRequest = { error: "Invalid request." } as const;

export const fnbCampaignRoutes = new Elysia({ name: "fnb-campaign-routes" })
  .use(authPlugin)
  .get("/fnb-campaigns/style-presets", () => ({ presets: STYLE_PRESETS }), { auth: true })
  .post("/fnb-campaigns", async ({ body, set, status, user }) => {
    const parsed = createBodySchema.safeParse(body);

    if (!parsed.success) return status(422, invalidRequest);
    const campaign = await createCampaign({ userId: user.id, ...parsed.data }, createCampaignServices());
    set.status = 201;

    return { campaign };
  }, { auth: true, ...jsonBody })
  .get("/fnb-campaigns", async ({ user }) => ({ campaigns: await listCampaigns(user.id, createCampaignServices()) }), { auth: true })
  .get("/fnb-campaigns/:id", async ({ params, user }) => getCampaign({ campaignId: params.id, userId: user.id }, createCampaignServices()), { auth: true, ...campaignParams })
  .post("/fnb-campaigns/:id/assets", async ({ params, request, set, user }) => {
    const contentLength = Number(request.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_ASSET_BYTES + 65536) throw new VideoError("video_asset_invalid", "Upload an image up to 10 MB.");
    const form = await request.formData().catch(() => { throw new VideoError("video_input_invalid", "Submit an image file and rights confirmation."); });
    const file = form.get("file");

    if (!(file instanceof File) || file.size > MAX_ASSET_BYTES) throw new VideoError("video_asset_invalid", "Upload a JPEG, PNG, or WebP image up to 10 MB.");
    const asset = await uploadCampaignAsset({ userId: user.id, projectId: params.id, bytes: new Uint8Array(await file.arrayBuffer()), declaredMimeType: file.type, rightsConfirmed: form.get("rightsConfirmed") === "true" }, createCampaignServices());
    set.status = 201;

    return { asset };
  }, { auth: true, parse: "none", ...campaignParams })
  .post("/fnb-campaigns/:id/generate", async ({ body, params, status, user }) => {
    const parsed = generateBodySchema.safeParse(body);

    if (!parsed.success) return status(422, invalidRequest);

    return { campaign: await generateCampaign({ campaignId: params.id, userId: user.id, ...parsed.data }, createCampaignServices()) };
  }, { auth: true, ...campaignParams, ...jsonBody })
  .put("/fnb-campaigns/:id/draft", async ({ body, params, status, user }) => {
    const parsed = saveBodySchema.safeParse(body);

    if (!parsed.success) return status(422, invalidRequest);

    return { campaign: await saveCampaignDraft({ campaignId: params.id, userId: user.id, ...parsed.data }, createCampaignServices()) };
  }, { auth: true, ...campaignParams, ...jsonBody })
  .post("/fnb-campaigns/:id/approve", async ({ body, params, status, user }) => {
    const parsed = approveBodySchema.safeParse(body);

    if (!parsed.success) return status(422, invalidRequest);

    return { campaign: await approveCampaign({ campaignId: params.id, userId: user.id, ...parsed.data }, createCampaignServices()) };
  }, { auth: true, ...campaignParams, ...jsonBody })
  .post("/fnb-campaigns/:id/render", async ({ body, params, status, user }) => {
    const parsed = renderBodySchema.safeParse(body);

    if (!parsed.success) return status(422, invalidRequest);

    return { job: await renderCampaign({ campaignId: params.id, userId: user.id, ...parsed.data }, createCampaignServices()) };
  }, { auth: true, ...campaignParams, ...jsonBody })
  .get("/fnb-campaigns/:id/render-jobs/:jobId", async ({ params, user }) => ({ job: await getCampaignRenderJob({ campaignId: params.id, userId: user.id, jobId: params.jobId }, createCampaignServices()) }), { auth: true, ...jobParams })
  .get("/fnb-campaigns/:id/download/:jobId", async ({ params, user }) => downloadCampaignRender({ campaignId: params.id, userId: user.id, jobId: params.jobId }, createCampaignServices()), { auth: true, ...jobParams })
  .get("/fnb-campaigns/:id/composition/:revision", async ({ params, query, set, status, user }) => {
    const parsed = z.coerce.number().int().positive().safeParse(params.revision);

    if (!parsed.success || (query.format !== undefined && query.format !== "json")) return status(422, invalidRequest);
    const html = await getCampaignComposition({ campaignId: params.id, userId: user.id, revision: parsed.data }, createCampaignServices());
    set.headers["cache-control"] = "private, no-store";

    if (query.format === "json") return { html };
    set.headers["content-type"] = "text/html; charset=utf-8";
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["content-security-policy"] = "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

    return html;
  }, { auth: true, params: t.Object({ id: t.String({ format: "uuid" }), revision: t.String() }) });
