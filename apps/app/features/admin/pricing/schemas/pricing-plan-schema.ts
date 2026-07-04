import { z } from "zod";

export const pricingPlanSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1, "Slug is required.").regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
  name: z.string().trim().min(1, "Name is required."),
  priceAmount: z.coerce.number().int().min(0, "Price must be 0 or more."),
  currency: z.string().trim().min(1, "Currency is required.").default("IDR"),
  billingPeriod: z.enum(["monthly", "annually"]),
  billingLabel: z.string().trim().min(1, "Billing label is required."),
  compareAtAmount: z.preprocess((value) => (value === "" ? null : value), z.coerce.number().int().min(0, "Compare at amount must be 0 or more.").nullable()),
  badgeLabel: z.string().trim().transform((value) => value || null),
  ctaLabel: z.string().trim().min(1, "CTA label is required."),
  credits: z.coerce.number().int().positive("Credits must be more than 0."),
  bonusCredits: z.coerce.number().int().min(0, "Bonus credits must be 0 or more."),
  creditExpiresInDays: z.coerce.number().int().positive("Expiry must be more than 0 days."),
  features: z.string().transform((value) => value.split("\n").map((feature) => feature.trim()).filter(Boolean)),
  isActive: z.preprocess((value) => value === "true", z.boolean()),
  isMostPopular: z.preprocess((value) => value === "true", z.boolean()),
  sortOrder: z.coerce.number().int(),
});

export type PricingPlanInput = z.infer<typeof pricingPlanSchema>;
