export type SceneId = "hook" | "product" | "discount" | "end-card";

export type CampaignBrief = {
  campaignName: string; productName: string; brandName: string; originalPrice: number;
  discountPercent: number; promoPeriod: string; cta: string; productAssetId: string; logoAssetId: string | null;
};

export type Scene = {
  id: SceneId; type: SceneId; start: number; duration: number;
  headline: string; subheadline: string; cta: string; productAssetId: string;
};

export type VideoPlan = { scenes: Scene[] };

export type StyleTokens = {
  primary: string; secondary: string; accent: string; background: string; text: string;
  typography: "bold" | "editorial" | "clean"; backgroundTreatment: "solid" | "radial"; density: "balanced" | "bold";
};

export type CampaignDraft = { brief: CampaignBrief; plan: VideoPlan; style: StyleTokens };

export type Campaign = {
  id: string; title: string; revision: number; status: "draft" | "approved" | "rendering" | "completed" | "failed";
  draft: CampaignDraft | null; initialPlan: VideoPlan | null; compositionRevision: number | null;
  compositionHash: string | null; validationErrors: string[]; approvedRevision: number | null; createdAt: string; updatedAt: string;
};

export type CampaignAsset = { id: string; mimeType: string; width: number; height: number; previewUrl: string };

export type CampaignVersion = {
  revision: number; draft: CampaignDraft; compositionHtml: string | null; compositionHash: string | null;
  validated: boolean; approvedAt: string | null;
};

export type RenderJob = {
  id: string; campaignId: string; idempotencyKey: string; revision: number; status: "queued" | "rendering" | "completed" | "failed";
  error: string | null; createdAt: string; updatedAt: string;
};

export type CampaignDetail = { campaign: Campaign; assets: CampaignAsset[]; versions: CampaignVersion[]; renderJobs: RenderJob[] };

export const sceneLabels: Record<SceneId, string> = { hook: "Hook", product: "Product reveal", discount: "Discount reveal", "end-card": "End card" };

export const statusLabels: Record<Campaign["status"], string> = { draft: "Draft", approved: "Disetujui", rendering: "Sedang dirender", completed: "MP4 tersedia", failed: "Render gagal" };

export const emptyBrief: CampaignBrief = { campaignName: "", productName: "", brandName: "", originalPrice: 0, discountPercent: 0, promoPeriod: "", cta: "", productAssetId: "", logoAssetId: null };

export function formatPrice(price: number) { return `Rp ${new Intl.NumberFormat("id-ID").format(price)}`; }

export function discountedPrice(brief: CampaignBrief) { return Number((BigInt(brief.originalPrice) * BigInt(100 - brief.discountPercent) + BigInt(50)) / BigInt(100)); }
