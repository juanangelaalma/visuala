"use client";

import { Badge } from "@visuala/ui";
import { useMemo, useState } from "react";
import PrimaryCtaButton from "../_components/PrimaryCtaButton";
import type { BillingPeriod, PricingPlan } from "./pricing-types";

type PlanTheme = "dark" | "light";

type PricingTabsProps = {
  plans: PricingPlan[];
};

const tabs: { value: BillingPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
];

const planThemeClassNames = {
  light: {
    card: "border-primary bg-gradient-to-br from-white to-neutral-150 shadow-pricing-featured",
    title: "text-black",
    muted: "text-black/60",
    feature: "text-black/80",
    bonus: "border-black/20 bg-black/10 text-black/70",
    check: "black",
    cta: "dark",
  },
  dark: {
    card: "border-white/20 bg-gradient-to-br from-black/80 to-black backdrop-blur-sm",
    title: "text-white",
    muted: "text-white/60",
    feature: "text-white/60",
    bonus: "border-primary/30 bg-primary/20 text-primary",
    check: "var(--color-primary)",
    cta: "light",
  },
} as const;

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}

function getPlanTheme(plan: PricingPlan): PlanTheme {
  return plan.isMostPopular ? "light" : "dark";
}

function getConversionLabel(credits: number) {
  const images = Math.floor(credits / 2.5);
  const videos = Math.floor(credits / 10);

  return `${formatNumber(images)} images or ${formatNumber(videos)} videos`;
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-1 shrink-0">
      <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PricingCard({ plan }: { plan: PricingPlan }) {
  const planTheme = getPlanTheme(plan);
  const theme = planThemeClassNames[planTheme];
  const totalCredits = plan.credits + plan.bonusCredits;

  return (
    <article className={`relative flex h-full flex-col rounded-3xl border-2 p-card-pad transition-all duration-300 ${theme.card}`}>
      {plan.isMostPopular ? (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary px-3 py-badge-y text-xs font-medium whitespace-nowrap text-black">
          Most Popular
        </Badge>
      ) : null}

      <div className="mb-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className={`text-2xl tracking-tight ${theme.title}`}>{plan.name}</h3>
          {plan.badgeLabel ? <Badge className={`border px-3 py-1 text-xs font-medium ${theme.bonus}`}>{plan.badgeLabel}</Badge> : null}
        </div>
        <div className="mb-6">
          {plan.compareAtAmount ? (
            <p className={`text-base tracking-tight line-through ${theme.muted}`}>{formatCurrency(plan.compareAtAmount, plan.currency)}</p>
          ) : null}
          <p className={`font-display text-section-sm leading-none font-medium tracking-tight ${theme.title}`}>
            {formatCurrency(plan.priceAmount, plan.currency)}
            <span className={`ml-2 font-sans text-base font-medium ${theme.muted}`}>{plan.billingLabel}</span>
          </p>
        </div>
        <div className="mb-6 space-y-2">
          <p className={`text-body-lg font-medium tracking-tight ${theme.title}`}>{formatNumber(plan.credits)} credits</p>
          <p className={`text-sm tracking-tight ${theme.muted}`}>{getConversionLabel(plan.credits)}</p>
        </div>
        {plan.bonusCredits > 0 ? (
          <Badge className={`gap-2 border px-3 py-2 text-sm font-medium ${theme.bonus}`}>
            <span className="text-base">🎁</span>
            <span className="tracking-tight">Total: {formatNumber(totalCredits)} credits</span>
          </Badge>
        ) : null}
      </div>

      <div className="mt-8 grow">
        <ul className="mb-10 space-y-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <CheckIcon color={theme.check} />
              <span className={`text-sm leading-5 tracking-tight ${theme.feature}`}>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <PrimaryCtaButton tone={theme.cta} className={`w-full px-8 py-3.5 text-base font-semibold ${planTheme === "light" ? "shadow-pricing-cta" : ""}`}>
        {plan.ctaLabel}
      </PrimaryCtaButton>
    </article>
  );
}

export default function PricingTabs({ plans }: PricingTabsProps) {
  const [activePeriod, setActivePeriod] = useState<BillingPeriod>("monthly");
  const visiblePlans = useMemo(() => plans.filter((plan) => plan.billingPeriod === activePeriod), [activePeriod, plans]);

  return (
    <>
      <div className="mb-10 flex justify-center">
        <div className="inline-flex rounded-full border border-white/10 bg-black/40 p-1">
          {tabs.map((tab) => (
            <button key={tab.value} type="button" onClick={() => setActivePeriod(tab.value)} className={`rounded-full px-6 py-3 text-sm font-semibold transition ${activePeriod === tab.value ? "bg-primary text-black" : "text-neutral-450 hover:text-white"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {visiblePlans.length > 0 ? (
        <div className="mb-16 grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
          {visiblePlans.map((plan) => <PricingCard key={plan.id} plan={plan} />)}
        </div>
      ) : (
        <div className="mb-16 rounded-3xl border border-white/10 bg-black/40 p-8 text-center text-neutral-450">
          Pricing plans are coming soon.
        </div>
      )}
    </>
  );
}
