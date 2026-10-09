import { afterEach, describe, expect, it, vi } from "vitest";
import {
  campaignAssetResponseSchema, campaignDetailResponseSchema, campaignFailureSchema,
  campaignRequest, CampaignRequestError, campaignResponseSchema,
  compositionResponseSchema, downloadResponseSchema, renderJobResponseSchema, stylePresetsResponseSchema,
} from "./api";
import { emptyBrief, type Campaign, type CampaignAsset, type CampaignDraft, type RenderJob } from "./types";

const campaignId = "b8a9da75-73c2-4b59-a39c-1ec9154b0aad";

const assetId = "5c29fbd1-18b9-42ab-9be1-153a835b522b";

const jobId = "bd6e7a3f-a6bc-4c5b-8d50-62eb3426c8d1";

const timestamp = "2026-10-09T00:00:00Z";

const campaign: Campaign = {
  id: campaignId, title: "Campaign tersimpan", revision: 0, status: "draft", draft: null, initialPlan: null,
  compositionRevision: null, compositionHash: null, validationErrors: [], approvedRevision: null,
  createdAt: timestamp, updatedAt: timestamp,
};

const asset: CampaignAsset = { id: assetId, mimeType: "image/png", width: 800, height: 800, previewUrl: "https://example.com/product.png" };

const draft: CampaignDraft = {
  brief: { ...emptyBrief, productAssetId: assetId },
  plan: { scenes: [
    { id: "hook", type: "hook", start: 0, duration: 2, headline: "", subheadline: "", cta: "", productAssetId: assetId },
    { id: "product", type: "product", start: 2, duration: 4, headline: "", subheadline: "", cta: "", productAssetId: assetId },
    { id: "discount", type: "discount", start: 6, duration: 5, headline: "", subheadline: "", cta: "", productAssetId: assetId },
    { id: "end-card", type: "end-card", start: 11, duration: 4, headline: "", subheadline: "", cta: "", productAssetId: assetId },
  ] },
  style: { primary: "#244734", secondary: "#e9be7d", accent: "#b34327", background: "#f5f2e9", text: "#222c25", typography: "editorial", backgroundTreatment: "radial", density: "balanced" },
};

const job: RenderJob = {
  id: jobId, campaignId, idempotencyKey: "render-fixture-key", revision: 1, status: "queued", error: null, createdAt: timestamp, updatedAt: timestamp,
};

afterEach(() => vi.unstubAllGlobals());

describe("campaign response contracts", () => {

  it("rejects invalid nested fields before domain use", () => {
    expect(campaignResponseSchema.safeParse({ campaign: { ...campaign, revision: "0" } }).success).toBe(false);
    expect(campaignResponseSchema.safeParse({ campaign: { ...campaign, status: "queued" } }).success).toBe(false);
    expect(campaignAssetResponseSchema.safeParse({ asset: { ...asset, width: null } }).success).toBe(false);
    expect(renderJobResponseSchema.safeParse({ job: { ...job, status: "unknown" } }).success).toBe(false);
    expect(campaignDetailResponseSchema.safeParse({ campaign, assets: [], versions: [], renderJobs: null }).success).toBe(false);
    expect(stylePresetsResponseSchema.safeParse({ presets: [{ id: "invalid", label: "Invalid", tokens: { ...draft.style, typography: "other" } }] }).success).toBe(false);
    expect(compositionResponseSchema.safeParse({ html: 42 }).success).toBe(false);
  });

  it.each(["javascript:alert(1)", "data:text/plain,video", "not-a-url"])("rejects an unsafe download URL %s", (url) => {
    expect(downloadResponseSchema.safeParse({ url }).success).toBe(false);
  });

  it("keeps domain errors, including conflict status, while normalizing non-errors", () => {
    const conflict = new CampaignRequestError("Revisi berubah", 409);
    expect(campaignFailureSchema.parse(conflict)).toBe(conflict);
    expect(campaignFailureSchema.parse("untrusted failure")).toBeInstanceOf(Error);
  });
});

describe("campaign request boundary", () => {

  it("rejects malformed successful JSON without laundering it into a campaign", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ campaign: { ...campaign, revision: "0" } })));
    await expect(campaignRequest("", campaignResponseSchema)).rejects.toMatchObject({ status: 200 });
  });

  it("rejects an unreadable successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(campaignRequest("", campaignResponseSchema)).rejects.toBeInstanceOf(CampaignRequestError);
  });

  it("preserves backend error messages and conflict status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Revisi berubah" }, { status: 409 })));
    await expect(campaignRequest("", campaignResponseSchema)).rejects.toMatchObject({ status: 409, message: "Revisi berubah" });
  });

  it("uses the existing fallback for malformed error payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "invalid representation" } }, { status: 502 })));
    await expect(campaignRequest("", campaignResponseSchema)).rejects.toMatchObject({ status: 502 });
  });

});
