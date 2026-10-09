import { describe, expect, it } from "vitest";
import { campaignBriefSchema, contrastRatio, discountedPrice, draftSchema, findUnsupportedSceneFacts, formatPrice, inkForColor, SCENE_TIMELINE, STYLE_PRESETS, styleTokensSchema, videoPlanSchema, type CampaignBrief, type VideoPlan } from "./campaign";

const brief: CampaignBrief = { campaignName: "Promo Kopi", productName: "Kopi Susu", brandName: "Kedai Kopi", originalPrice: 28000, discountPercent: 30, promoPeriod: "8–14 Oktober", cta: "Pesan kopi sekarang", productAssetId: "00000000-0000-4000-8000-000000000001", logoAssetId: null };

const plan = videoPlanSchema.parse({ scenes: SCENE_TIMELINE.map((scene) => ({ ...scene, headline: brief.productName, subheadline: "", cta: brief.cta, productAssetId: brief.productAssetId })) });

function planWithHeadline(headline: string): VideoPlan {
  const changed = structuredClone(plan);
  changed.scenes[0].headline = headline;

  return changed;
}

describe("F&B campaign domain", () => {
  it("requires four scenes in the locked order and exact timing", () => {
    expect(videoPlanSchema.safeParse(plan).success).toBe(true);
    const changed = structuredClone(plan);
    Object.assign(changed.scenes[1], { start: 3 });
    expect(videoPlanSchema.safeParse(changed).success).toBe(false);
    expect(videoPlanSchema.safeParse({ scenes: [...plan.scenes].reverse() }).success).toBe(false);
    expect(videoPlanSchema.safeParse({ scenes: plan.scenes.slice(0, 3) }).success).toBe(false);
  });

  it("rounds half-rupiah prices up without floating-point drift", () => {
    expect(discountedPrice(28000, 30)).toBe(19600);
    expect(discountedPrice(101, 50)).toBe(51);
    expect(discountedPrice(Number.MAX_SAFE_INTEGER, 1)).toBe(8917127262193581);
    expect(discountedPrice(28000, 100)).toBe(0);
    expect(formatPrice(19600)).toBe("Rp 19.600");
  });

  it("rejects invalid discounts, fractional prices, and unknown fields", () => {
    expect(campaignBriefSchema.safeParse({ ...brief, discountPercent: 101 }).success).toBe(false);
    expect(campaignBriefSchema.safeParse({ ...brief, originalPrice: 1.5 }).success).toBe(false);
    expect(campaignBriefSchema.safeParse({ ...brief, inventedClaim: "Halal" }).success).toBe(false);
  });

  it("rejects fabricated prices, discount percentages and product claims", () => {
    for (const headline of ["Rp 9.000", "Rp 30", "Diskon 50%", "Kopi organik", "Gratis ongkir", "Hanya hari ini", "30 Oktober"]) {
      expect(findUnsupportedSceneFacts(brief, planWithHeadline(headline)), headline).toEqual(["scenes.hook.headline"]);
    }
  });

  it("accepts submitted dates and deterministic commercial facts", () => {
    for (const headline of ["Rp 19.600", "Diskon 30%", "8–14 Oktober", brief.productName]) {
      expect(findUnsupportedSceneFacts(brief, planWithHeadline(headline)), headline).toEqual([]);
    }

    expect(draftSchema.safeParse({ brief, plan: planWithHeadline("Gratis ongkir"), style: STYLE_PRESETS[0]!.tokens }).success).toBe(false);
  });

  it("chooses readable ink even for mid-tone accent surfaces", () => {
    for (const surface of ["#777777", "#7a7a7a", "#808080", ...STYLE_PRESETS.map((preset) => preset.tokens.accent)]) {
      expect(contrastRatio(inkForColor(surface), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("allowlists style values, rejects CSS injection and checks both radial surfaces", () => {
    for (const preset of STYLE_PRESETS) expect(styleTokensSchema.safeParse(preset.tokens).success).toBe(true);
    expect(styleTokensSchema.safeParse({ ...STYLE_PRESETS[0]!.tokens, typography: "comic-sans" }).success).toBe(false);
    expect(styleTokensSchema.safeParse({ ...STYLE_PRESETS[0]!.tokens, primary: "red;}</style><script>" }).success).toBe(false);
    expect(styleTokensSchema.safeParse({ ...STYLE_PRESETS[0]!.tokens, text: "#f5f2e9" }).success).toBe(false);
    expect(styleTokensSchema.safeParse({ ...STYLE_PRESETS[0]!.tokens, secondary: "#222c25" }).success).toBe(false);
  });
});
