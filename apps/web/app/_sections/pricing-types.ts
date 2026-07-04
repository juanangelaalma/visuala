export type BillingPeriod = "monthly" | "annually";

export type PricingPlan = {
  id: string;
  slug: string;
  name: string;
  priceAmount: number;
  currency: string;
  billingPeriod: BillingPeriod;
  billingLabel: string;
  compareAtAmount: number | null;
  badgeLabel: string | null;
  ctaLabel: string;
  credits: number;
  bonusCredits: number;
  creditExpiresInDays: number;
  features: string[];
  isActive: boolean;
  isMostPopular: boolean;
  sortOrder: number;
};
