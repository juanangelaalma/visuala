export type BillingPeriod = "monthly" | "annually";

export type CreditPricingPlan = {
    id: string;
    slug: string;
    name: string;
    priceAmount: number;
    currency: string;
    credits: number;
    bonusCredits: number;
    creditExpiresInDays: number;
    billingPeriod?: BillingPeriod;
    billingLabel?: string;
    compareAtAmount?: number | null;
    badgeLabel?: string | null;
    isMostPopular?: boolean;
    features: string[];
    ctaLabel: string;
    ctaHref?: string;
    isCurrent?: boolean;
};
