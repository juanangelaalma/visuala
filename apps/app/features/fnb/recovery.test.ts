import { afterEach, describe, expect, it, vi } from "vitest";
import { creationRecoverySchema, editorRecoverySchema, readRecovery } from "./recovery";
import { emptyBrief, type Campaign, type CampaignAsset, type CampaignDraft } from "./types";

const campaignId = "b8a9da75-73c2-4b59-a39c-1ec9154b0aad";

const assetId = "5c29fbd1-18b9-42ab-9be1-153a835b522b";

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

const campaign: Campaign = {
  id: campaignId, title: "Campaign tersimpan", revision: 4, status: "draft", draft: null, initialPlan: null,
  compositionRevision: null, compositionHash: null, validationErrors: [], approvedRevision: null,
  createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
};

const asset: CampaignAsset = { id: assetId, mimeType: "image/png", width: 800, height: 800, previewUrl: "https://example.com/product.png" };

afterEach(() => vi.unstubAllGlobals());

describe("editor recovery", () => {
  it("keeps the original base revision and unfinished local draft intact", () => {
    const stored = { revision: 2, draft, brief: draft.brief };
    vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify(stored) });
    expect(readRecovery("visuala:fnb:test", editorRecoverySchema)).toEqual(stored);
  });

  it("accepts an incomplete brief before a storyboard exists", () => {
    expect(editorRecoverySchema.parse({ revision: 0, draft: null, brief: emptyBrief })).toEqual({ revision: 0, draft: null, brief: emptyBrief });
  });

  it.each([-1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1])("rejects invalid base revision %s", (revision) => {
    expect(editorRecoverySchema.safeParse({ revision, draft: null, brief: emptyBrief }).success).toBe(false);
  });

  it("rejects a draft whose fixed scene timeline was changed", () => {
    const changed = { ...draft, plan: { scenes: draft.plan.scenes.map((scene) => ({ ...scene, duration: 20 })) } };
    expect(editorRecoverySchema.safeParse({ revision: 2, draft: changed, brief: draft.brief }).success).toBe(false);
  });

  it.each(["not-json", "null", "{}", '{"revision":2,"draft":null,"brief":{"productName":12}}'])("ignores unusable browser data %s", (stored) => {
    vi.stubGlobal("sessionStorage", { getItem: () => stored });
    expect(readRecovery("visuala:fnb:test", editorRecoverySchema)).toBeNull();
  });

  it("continues without recovery when browser storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("Storage disabled"); } });
    expect(readRecovery("visuala:fnb:test", editorRecoverySchema)).toBeNull();
  });
});

describe("creation recovery", () => {
  const stored = { brief: { ...emptyBrief, productAssetId: assetId }, campaign, assets: [asset] };

  it("preserves the server campaign revision and uploaded assets", () => {
    expect(creationRecoverySchema.parse(stored)).toEqual(stored);
  });

  it.each([{}, { ...campaign, id: "invalid" }, { ...campaign, revision: -1 }])("rejects malformed campaign records", (invalidCampaign) => {
    expect(creationRecoverySchema.safeParse({ ...stored, campaign: invalidCampaign }).success).toBe(false);
  });

  it.each(["not-a-url", "javascript:alert(1)", "data:image/png;base64,AAA"]) ("rejects unsafe asset URLs %s without throwing", (previewUrl) => {
    expect(creationRecoverySchema.safeParse({ ...stored, assets: [{ ...asset, previewUrl }] }).success).toBe(false);
  });

  it("rejects an asset without its dimensions", () => {
    expect(creationRecoverySchema.safeParse({ ...stored, assets: [{ id: assetId, mimeType: "image/png", previewUrl: asset.previewUrl }] }).success).toBe(false);
  });
});
