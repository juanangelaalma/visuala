import { Badge, PricingPeriodTabs } from "@visuala/ui";
import { OutlineButton } from "../_components/OutlineButton";
import type { PricingPlan } from "./pricing-types";

type PricingPlansResponse = {
  plans: PricingPlan[];
};

const appApiUrl = process.env.NEXT_PUBLIC_APP_API_URL ?? "http://localhost:3000";

async function getPricingPlans(): Promise<PricingPlan[]> {
  try {
    const response = await fetch(`${appApiUrl}/api/pricing-plans`, { next: { revalidate: 300 } });

    if (!response.ok) return [];

    const data = (await response.json()) as PricingPlansResponse;
    return data.plans;
  } catch {
    return [];
  }
}

function EnterpriseBanner() {
  return (
    <aside className="rounded-3xl border-2 border-white/20 bg-gradient-to-r from-white/5 to-white/10 p-card-pad backdrop-blur-sm">
      <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
        <div className="text-center md:text-left">
          <h3 className="mb-2 text-display-sm font-normal tracking-tight text-white">
            Need more? Let&apos;s talk about enterprise options
          </h3>
          <p className="text-body-lg font-light tracking-tight text-white/70">
            Get custom plans, dedicated support, and exclusive features tailored to your brand&apos;s creative needs.
          </p>
        </div>
        <OutlineButton className="px-card-pad py-3.5 uppercase">Talk to sales</OutlineButton>
      </div>
    </aside>
  );
}

export default async function PricingSection() {
  const plans = await getPricingPlans();

  return (
    <section className="w-full overflow-hidden bg-pricing-bg px-4 py-24">
      <div className="mx-auto max-w-page">
        <div className="mb-10 flex justify-center">
          <Badge className="gap-2 bg-primary px-10 py-4 font-sans-secondary text-base font-bold tracking-wide text-black uppercase">
            <span>🎉</span>
            Launch offer: Get 2× credits on your first month
          </Badge>
        </div>

        <header className="mb-16 text-center">
          <h2 className="font-display mb-6 text-section-md leading-tight font-normal text-white">
            Price that scales with you
          </h2>
          <div className="space-y-1">
            <p className="text-body-xl leading-loose text-neutral-450">Premium Quality at Every Tier.</p>
            <p className="flex items-center justify-center gap-4 text-base leading-loose text-neutral-500">
              <span>4 images = 10 credits</span>
              <span>•</span>
              <span>1 video = 10 credits</span>
            </p>
          </div>
        </header>

        <PricingPeriodTabs plans={plans} />
        <EnterpriseBanner />
      </div>
    </section>
  );
}
