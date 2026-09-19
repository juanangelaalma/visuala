import { z } from "zod";

export const pricingPlanBodySchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
  name: z.string().trim().min(1),
  priceAmount: z.coerce.number().int().min(0),
  currency: z.string().trim().min(1).default("IDR"),
  billingPeriod: z.enum(["monthly", "annually"]),
  billingLabel: z.string().trim().min(1),
  compareAtAmount: z.coerce.number().int().min(0).nullable().default(null),
  badgeLabel: z.string().trim().min(1).nullable().default(null),
  ctaLabel: z.string().trim().min(1),
  credits: z.coerce.number().int().positive(),
  bonusCredits: z.coerce.number().int().min(0),
  creditExpiresInDays: z.coerce.number().int().positive(),
  features: z.array(z.string().trim().min(1)),
  isActive: z.boolean(),
  isMostPopular: z.boolean(),
  sortOrder: z.coerce.number().int(),
});

export type PricingPlanBody = z.infer<typeof pricingPlanBodySchema>;
