import Badge from "../_components/Badge";
import PrimaryCtaButton from "../_components/PrimaryCtaButton";
import { OutlineButton } from "../_components/OutlineButton";

type PlanTheme = "dark" | "light";

type Plan = {
  id: string;
  name: string;
  price: string;
  credits: string;
  conversion: string;
  bonus: string;
  features: string[];
  theme: PlanTheme;
  mostPopular?: boolean;
};

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "Rp899k",
    credits: "250 credits",
    conversion: "100 images or 25 videos",
    bonus: "First month: 500 credits",
    features: [
      "Commercial use for all generated assets",
      "Live chat & email support",
      "Access to all styles",
    ],
    theme: "dark",
  },
  {
    id: "professional",
    name: "Professional",
    price: "Rp3,9jt",
    credits: "1,000 credits",
    conversion: "400 images or 100 videos",
    bonus: "First month: 2,000 credits",
    features: [
      "Commercial use for all generated assets",
      "Priority support",
      "Custom styles to your brand (coming soon)",
    ],
    mostPopular: true,
    theme: "light",
  },
  {
    id: "business",
    name: "Business",
    price: "Rp6,9jt",
    credits: "2,500 credits",
    conversion: "1,000 images or 250 videos",
    bonus: "First month: 5,000 credits",
    features: [
      "Commercial use for all generated assets",
      "Dedicated support",
      "Custom styles to your brand (coming soon)",
      "API Access (coming soon)",
    ],
    theme: "dark",
  },
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

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-1 shrink-0">
      <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PricingCard({ plan }: { plan: Plan }) {
  const theme = planThemeClassNames[plan.theme];

  return (
    <article className={`relative flex h-full flex-col rounded-3xl border-2 p-card-pad transition-all duration-300 ${theme.card}`}>
      {plan.mostPopular ? (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary px-3 py-badge-y text-xs font-medium whitespace-nowrap text-black">
          Most Popular
        </Badge>
      ) : null}

      <div className="mb-4">
        <h3 className={`mb-4 text-2xl tracking-tight ${theme.title}`}>{plan.name}</h3>
        <p className={`font-display mb-6 text-section-sm leading-none font-medium tracking-tight ${theme.title}`}>
          {plan.price}
        </p>
        <div className="mb-6 space-y-2">
          <p className={`text-body-lg font-medium tracking-tight ${theme.title}`}>{plan.credits}</p>
          <p className={`text-sm tracking-tight ${theme.muted}`}>{plan.conversion}</p>
        </div>
        <Badge className={`gap-2 border px-3 py-2 text-sm font-medium ${theme.bonus}`}>
          <span className="text-base">🎁</span>
          <span className="tracking-tight">{plan.bonus}</span>
        </Badge>
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

      <PrimaryCtaButton
        tone={theme.cta}
        className={`w-full px-8 py-3.5 text-base font-semibold ${plan.theme === "light" ? "shadow-pricing-cta" : ""}`}
      >
        Start free trial
      </PrimaryCtaButton>
    </article>
  );
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

export default function PricingSection() {
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

        <div className="mb-16 grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
          {plans.map((plan) => <PricingCard key={plan.id} plan={plan} />)}
        </div>

        <EnterpriseBanner />
      </div>
    </section>
  );
}
