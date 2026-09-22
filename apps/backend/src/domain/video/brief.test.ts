import { describe, expect, it } from "vitest";
import { findMissingBriefFields, findUnsupportedCommercialFacts, isBriefDraftComplete, videoBriefDraftSchema, videoBriefSchema } from "./brief";
import type { VideoBrief } from "./brief";

const baseBrief: VideoBrief = {
  productName: "Kopi Susu Gula Aren",
  productCategory: "Minuman",
  audience: "Mahasiswa dan pekerja kantor di Bandung",
  objective: "Meningkatkan pesanan langsung lewat WhatsApp",
  keyMessage: "Kopi susu gula aren asli, manisnya pas",
  offer: null,
  callToAction: "Pesan sekarang",
  orderDestination: null,
  brandName: "Kopi Bang Aldi",
  styleId: "warm_artisan" as const,
  outputSettings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
  menuItems: null,
  facts: [],
};

describe("video brief", () => {
  it("parses a brief that matches the schema", () => {
    expect(videoBriefSchema.safeParse(baseBrief).success).toBe(true);
  });

  it("rejects an unknown field rather than ignoring it", () => {
    expect(videoBriefSchema.safeParse({ ...baseBrief, discountPercent: 50 }).success).toBe(false);
  });

  it("names the fields a video type still needs", () => {
    expect(findMissingBriefFields(baseBrief, "product_promo")).toEqual([]);
    expect(findMissingBriefFields({ ...baseBrief, callToAction: null }, "product_promo")).toEqual(["callToAction"]);
    expect(findMissingBriefFields({ ...baseBrief, offer: null }, "discount_promo")).toEqual(["offer"]);
    expect(findMissingBriefFields({ ...baseBrief, menuItems: [{ name: "Kopi Susu", price: null }] }, "menu_showcase")).toEqual(["menuItems"]);
  });

  it("flags a price the user never confirmed", () => {
    const brief = {
      ...baseBrief,
      offer: { label: "Promo Mingguan", detail: "Diskon 30%" },
      facts: [],
    };

    expect(findUnsupportedCommercialFacts(brief)).toEqual(["offer.label", "offer.detail"]);
  });

  it("accepts a commercial fact the user confirmed and ignores asset analysis as confirmation", () => {
    const confirmed = {
      ...baseBrief,
      offer: { label: "Promo Mingguan", detail: "Diskon 30%" },
      facts: [
        { field: "offer.label", value: "Promo Mingguan", source: "user_message" as const },
        { field: "offer.detail", value: "Diskon 30%", source: "user_confirmation" as const },
      ],
    };
    const fromImage = {
      ...confirmed,
      facts: confirmed.facts.map((fact) => ({ ...fact, source: "asset_analysis" as const })),
    };

    expect(findUnsupportedCommercialFacts(confirmed)).toEqual([]);
    expect(findUnsupportedCommercialFacts(fromImage)).toEqual(["offer.label", "offer.detail"]);
  });

  it("flags an unconfirmed menu item price but not an unconfirmed item name", () => {
    const brief = {
      ...baseBrief,
      menuItems: [{ name: "Es Teh Manis", price: "Rp 8.000" }, { name: "Kopi Susu", price: null }],
      facts: [],
    };

    expect(findUnsupportedCommercialFacts(brief)).toEqual(["menuItems[0].price"]);
  });
});

describe("video brief draft", () => {
  const confirmedOffer = {
    offer: { label: "Promo Mingguan", detail: "Diskon 30%" },
    facts: [
      { field: "offer.label", value: "Promo Mingguan", source: "user_confirmation" as const },
      { field: "offer.detail", value: "Diskon 30%", source: "user_confirmation" as const },
    ],
  };

  it("parses a draft whose required fields are still empty", () => {
    const draft = { ...baseBrief, productName: null, audience: null, objective: null, keyMessage: null, callToAction: null };

    expect(videoBriefDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("keeps the draft and the approvable shape in step, and still refuses an unknown field", () => {
    expect(videoBriefDraftSchema.safeParse(videoBriefSchema.parse(baseBrief)).success).toBe(true);
    expect(videoBriefDraftSchema.safeParse({ ...baseBrief, price: 1 }).success).toBe(false);
  });

  it("calls a draft complete only once its type's fields and every commercial fact are settled", () => {
    expect(isBriefDraftComplete(baseBrief, "product_promo")).toBe(true);
    expect(isBriefDraftComplete(baseBrief, "discount_promo")).toBe(false);
    expect(isBriefDraftComplete({ ...baseBrief, callToAction: null }, "product_promo")).toBe(false);
    expect(isBriefDraftComplete({ ...baseBrief, audience: null, ...confirmedOffer }, "discount_promo")).toBe(false);
    expect(isBriefDraftComplete({ ...baseBrief, ...confirmedOffer }, "discount_promo")).toBe(true);
    expect(isBriefDraftComplete({ ...baseBrief, ...confirmedOffer, facts: [] }, "discount_promo")).toBe(false);
  });
});
