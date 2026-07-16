import Badge from "./Badge";
import Button from "./Button";
import type { CreditPricingPlan } from "./pricing-types";

type PlanTheme = "dark" | "light" | "openai";

export type PricingPlanCardProps = {
    plan: CreditPricingPlan;
    variant?: "marketing" | "checkout";
};

const planThemeClassNames = {
    light: {
        card: "border-primary bg-gradient-to-br from-white to-neutral-150 shadow-pricing-featured",
        title: "text-black",
        muted: "text-black/60",
        feature: "text-black/80",
        bonus: "border-black/20 bg-black/10 text-black/70",
        check: "black",
        ctaVariant: "solid",
        ctaTone: "dark",
    },
    dark: {
        card: "border-white/20 bg-gradient-to-br from-black/80 to-black backdrop-blur-sm",
        title: "text-white",
        muted: "text-white/60",
        feature: "text-white/60",
        bonus: "border-primary/30 bg-primary/20 text-primary",
        check: "var(--color-primary)",
        ctaVariant: "solid",
        ctaTone: "light",
    },
    openai: {
        card: "border-white/10 bg-surface text-white shadow-sm",
        title: "text-white",
        muted: "text-neutral-400",
        feature: "text-neutral-300",
        bonus: "border-primary/30 bg-primary/10 text-primary",
        check: "var(--color-primary)",
        ctaVariant: "solid",
        ctaTone: "dark",
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

function getPlanTheme(plan: CreditPricingPlan, variant: PricingPlanCardProps["variant"]): PlanTheme {
    if (variant === "checkout") return "openai";
    return plan.isMostPopular ? "light" : "dark";
}

function getConversionLabel(credits: number) {
    const images = Math.floor(credits / 2.5);
    const videos = Math.floor(credits / 10);

    return `${formatNumber(images)} images or ${formatNumber(videos)} videos`;
}

function CheckIcon({ color }: { color: string }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-1 shrink-0" aria-hidden="true">
            <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function PricingPlanCard({ plan, variant = "marketing" }: PricingPlanCardProps) {
    const planTheme = getPlanTheme(plan, variant);
    const theme = planThemeClassNames[planTheme];
    const totalCredits = plan.credits + plan.bonusCredits;
    const billingLabel = plan.billingLabel ?? "one-time";
    const isCheckout = variant === "checkout";
    const usesTopRightBadge = isCheckout && plan.isMostPopular;
    const cardClassName = usesTopRightBadge ? "border-primary/40 bg-primary/10 shadow-[0_0_40px_rgba(239,243,27,0.08)]" : theme.card;

    return (
        <article className={`relative flex h-full flex-col rounded-3xl border p-6 transition-all duration-300 ${cardClassName}`}>
            {plan.isMostPopular ? (
                <Badge className={`absolute ${usesTopRightBadge ? "top-6 right-6 bg-primary text-black" : "-top-3 left-1/2 -translate-x-1/2 bg-primary text-black"} px-3 py-1 text-xs font-medium whitespace-nowrap`}>
                    {plan.badgeLabel ?? "Popular"}
                </Badge>
            ) : null}

            <div className="mb-4">
                <div className={`mb-4 flex items-start justify-between gap-3 ${usesTopRightBadge ? "pr-20" : ""}`}>
                    <h3 className={`text-2xl font-semibold tracking-tight ${theme.title}`}>{plan.name}</h3>
                </div>
                <div className="mb-5">
                    {plan.compareAtAmount ? (
                        <p className={`text-sm tracking-tight line-through ${theme.muted}`}>{formatCurrency(plan.compareAtAmount, plan.currency)}</p>
                    ) : null}
                    <p className={`font-display text-4xl leading-none font-semibold tracking-tight ${theme.title}`}>
                        {formatCurrency(plan.priceAmount, plan.currency)}
                        <span className={`ml-2 font-sans text-xs font-medium ${theme.muted}`}>/ {billingLabel}</span>
                    </p>
                </div>
                <div className="mb-5 space-y-2">
                    <p className={`text-base font-semibold tracking-tight ${theme.title}`}>{formatNumber(plan.credits)} credits</p>
                    <p className={`text-sm tracking-tight ${theme.muted}`}>{getConversionLabel(plan.credits)}</p>
                    <p className={`text-sm tracking-tight ${theme.muted}`}>Expires in {plan.creditExpiresInDays} days</p>
                </div>
                {plan.bonusCredits > 0 ? (
                    <Badge className={`gap-2 border px-3 py-2 text-sm font-medium ${theme.bonus}`}>
                        <span className="tracking-tight">Total: {formatNumber(totalCredits)} credits</span>
                    </Badge>
                ) : null}
            </div>

            <div className="mt-6 grow">
                <ul className="mb-8 space-y-3">
                    {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                            <CheckIcon color={theme.check} />
                            <span className={`text-sm leading-5 tracking-tight ${theme.feature}`}>{feature}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {plan.isCurrent ? (
                <div className="flex w-full items-center justify-center rounded-full border border-neutral-200 px-8 py-3 text-sm font-semibold text-neutral-500">
                    Your current plan
                </div>
            ) : (
                <Button href={plan.ctaHref ?? "#"} variant={theme.ctaVariant} tone={theme.ctaTone} className="w-full px-8 py-3 text-sm font-semibold">
                    {plan.ctaLabel}
                </Button>
            )}
        </article>
    );
}
