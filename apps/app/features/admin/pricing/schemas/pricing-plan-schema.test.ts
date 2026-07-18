import { describe, expect, it } from "vitest";
import { pricingPlanSchema } from "./pricing-plan-schema";

const valid = {
  slug: "pro-plan", name: "Pro", priceAmount: "100", currency: "IDR", billingPeriod: "monthly", billingLabel: "Monthly",
  compareAtAmount: "", badgeLabel: "", ctaLabel: "Buy", credits: "10", bonusCredits: "2", creditExpiresInDays: "30",
  features: "First\n\n Second ", isActive: "true", isMostPopular: "false", sortOrder: "1",
};

describe("pricingPlanSchema", () => {
  it("normalizes valid form input", () => {
    const result = pricingPlanSchema.parse(valid);
    expect(result).toMatchObject({ priceAmount: 100, compareAtAmount: null, badgeLabel: null, features: ["First", "Second"], isActive: true, isMostPopular: false });
  });

  it.each([
    ["slug", "Invalid Slug"], ["name", ""], ["priceAmount", "-1"], ["billingLabel", ""], ["ctaLabel", ""],
    ["credits", "0"], ["bonusCredits", "-1"], ["creditExpiresInDays", "0"],
  ])("rejects invalid %s", (field, value) => {
    expect(pricingPlanSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});
