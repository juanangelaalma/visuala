import type { CreditPricingPlan } from "@visuala/ui";
import { Badge, Button } from "@visuala/ui";
import type { PricingPlan } from "@/domain/pricing/types";
import { BillingPlansSelector } from "@/features/billing/components/BillingPlansSelector";
import { apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

function EnterpriseBanner() {
  return (
    <aside className="rounded-3xl border-2 border-white/20 bg-gradient-to-r from-white/5 to-white/10 p-card-pad backdrop-blur-sm">
      <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
        <div className="text-center md:text-left">
          <h3 className="mb-2 text-display-sm font-normal tracking-tight text-white">Need more? Let&apos;s talk about enterprise options</h3>
          <p className="text-body-lg font-light tracking-tight text-white/70">Get custom plans, dedicated support, and exclusive features tailored to your brand&apos;s creative needs.</p>
        </div>
        <Button href="mailto:sales@visuala.io" variant="outline" tone="light" className="border-white px-card-pad py-3.5 uppercase">Talk to sales</Button>
      </div>
    </aside>
  );
}

export default async function BillingPlansPage() {
  await requireUser();

  const { plans: activePlans } = await apiFetch<{ plans: PricingPlan[] }>("/pricing-plans");

  const plans: CreditPricingPlan[] = activePlans.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    credits: plan.credits,
    bonusCredits: plan.bonusCredits,
    creditExpiresInDays: plan.creditExpiresInDays,
    billingPeriod: plan.billingPeriod,
    billingLabel: plan.billingLabel,
    compareAtAmount: plan.compareAtAmount,
    badgeLabel: plan.badgeLabel,
    isMostPopular: plan.isMostPopular,
    features: plan.features,
    ctaLabel: plan.ctaLabel,
    ctaHref: `/billing/plans/${encodeURIComponent(plan.id)}/checkout`,
  }));

  return (
    <section className="w-full overflow-hidden bg-pricing-bg px-4 py-24">
      <div className="mx-auto max-w-page">
        <div className="mb-10 flex justify-center"><Badge className="bg-primary px-10 py-4 font-sans-secondary text-base font-bold tracking-wide text-black uppercase">Choose your credit bundle</Badge></div>
        <header className="mb-12 text-center">
          <h1 className="font-display mb-6 text-section-md leading-tight font-normal text-white">Price that scales with you</h1>
          <p className="text-body-xl text-neutral-450">Premium quality at every tier.</p>
        </header>
        <BillingPlansSelector plans={plans} />
        <EnterpriseBanner />
      </div>
    </section>
  );
}
