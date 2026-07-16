"use client";

import { useMemo, useState } from "react";
import PricingPlanCard from "./PricingPlanCard";
import type { BillingPeriod, CreditPricingPlan } from "./pricing-types";

export type PricingPeriodTabsProps = {
    plans: CreditPricingPlan[];
    variant?: "marketing" | "checkout";
    periods?: { value: BillingPeriod; label: string }[];
    emptyMessage?: string;
};

const defaultPeriods: { value: BillingPeriod; label: string }[] = [
    { value: "monthly", label: "Monthly" },
    { value: "annually", label: "Annually" },
];

export default function PricingPeriodTabs({ plans, variant = "marketing", periods = defaultPeriods, emptyMessage = "Pricing plans are coming soon." }: PricingPeriodTabsProps) {
    const [activePeriod, setActivePeriod] = useState<BillingPeriod>(periods[0]?.value ?? "monthly");
    const visiblePlans = useMemo(() => plans.filter((plan) => !plan.billingPeriod || plan.billingPeriod === activePeriod), [activePeriod, plans]);
    const isCheckout = variant === "checkout";

    return (
        <>
            {periods.length > 1 ? (
                <div className="mb-10 flex justify-center">
                    <div role="tablist" aria-label="Billing period" className={`inline-flex rounded-full p-1 ${isCheckout ? "border border-white/10 bg-surface" : "border border-white/10 bg-black/40"}`}>
                        {periods.map((tab) => (
                            <button
                                key={tab.value}
                                id={`pricing-tab-${tab.value}`}
                                type="button"
                                role="tab"
                                aria-selected={activePeriod === tab.value}
                                aria-controls={`pricing-panel-${tab.value}`}
                                tabIndex={activePeriod === tab.value ? 0 : -1}
                                onClick={() => setActivePeriod(tab.value)}
                                className={`rounded-full px-6 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${
                                    activePeriod === tab.value
                                        ? isCheckout
                                            ? "bg-primary text-black shadow-sm"
                                            : "bg-primary text-black"
                                        : isCheckout
                                          ? "text-neutral-400 hover:text-white"
                                          : "text-neutral-450 hover:text-white"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {visiblePlans.length > 0 ? (
                <div id={`pricing-panel-${activePeriod}`} role="tabpanel" aria-labelledby={`pricing-tab-${activePeriod}`} className={`mb-16 grid grid-cols-1 items-stretch gap-5 ${isCheckout ? "lg:grid-cols-4" : "md:grid-cols-3"}`}>
                    {visiblePlans.map((plan) => (
                        <PricingPlanCard key={plan.id} plan={plan} variant={variant} />
                    ))}
                </div>
            ) : (
                <div className={`mb-16 rounded-3xl p-8 text-center ${isCheckout ? "border border-white/10 bg-surface text-neutral-400" : "border border-white/10 bg-black/40 text-neutral-450"}`}>
                    {emptyMessage}
                </div>
            )}
        </>
    );
}
