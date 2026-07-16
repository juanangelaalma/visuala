import type { BillingPeriod, PricingPlan } from "./types";

export type SavePricingPlanInput = {
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

export interface PricingPlanRepository {
  findActiveById(id: string): Promise<PricingPlan | null>;
  listActive(): Promise<PricingPlan[]>;
  listAll(): Promise<PricingPlan[]>;
  create(input: SavePricingPlanInput): Promise<PricingPlan>;
  update(id: string, input: SavePricingPlanInput): Promise<PricingPlan>;
  delete(id: string): Promise<void>;
}
