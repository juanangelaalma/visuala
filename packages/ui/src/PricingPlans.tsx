import PricingPeriodTabs from "./PricingPeriodTabs";
import type { CreditPricingPlan } from "./pricing-types";

export type PricingPlansProps = {
    plans: CreditPricingPlan[];
    variant?: "marketing" | "checkout";
    title?: string;
    subtitle?: string;
};

export default function PricingPlans({ plans, variant = "marketing", title, subtitle }: PricingPlansProps) {
    const isCheckout = variant === "checkout";

    return (
        <section className={isCheckout ? "w-full bg-black px-4 py-12 text-white" : "w-full overflow-hidden bg-pricing-bg px-4 py-24"}>
            <div className={isCheckout ? "mx-auto max-w-7xl" : "mx-auto max-w-page"}>
                {title ? (
                    <header className={isCheckout ? "mb-8 text-center" : "mb-16 text-center"}>
                        <h1 className={isCheckout ? "text-2xl font-semibold tracking-tight text-white" : "font-display mb-6 text-section-md leading-tight font-normal text-white"}>{title}</h1>
                        {subtitle ? <p className={isCheckout ? "mt-2 text-sm text-neutral-400" : "text-body-xl leading-loose text-neutral-450"}>{subtitle}</p> : null}
                    </header>
                ) : null}
                <PricingPeriodTabs plans={plans} variant={variant} />
            </div>
        </section>
    );
}
