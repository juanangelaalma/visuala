import Link from "next/link";

const plans = [
  {
    id: "plan-starter",
    name: "Starter",
    description: "Perfect for freelancers and solo designers.",
    price: { monthly: 0, yearly: 0 },
    cta: "Get started free",
    ctaHref: "/signup",
    highlighted: false,
    features: [
      "Up to 3 projects",
      "1 editor seat",
      "Community design system",
      "Basic export (PNG, SVG)",
      "7-day version history",
    ],
  },
  {
    id: "plan-pro",
    name: "Pro",
    description: "For growing teams that need more power and collaboration.",
    price: { monthly: 29, yearly: 23 },
    cta: "Start 14-day free trial",
    ctaHref: "/signup?plan=pro",
    highlighted: true,
    badge: "Most popular",
    features: [
      "Unlimited projects",
      "Up to 10 editor seats",
      "Custom design system",
      "Code export (React, Tailwind)",
      "Unlimited version history",
      "Real-time collaboration",
      "AI design assistant",
      "Priority support",
    ],
  },
  {
    id: "plan-enterprise",
    name: "Enterprise",
    description: "Custom plans for large organisations with advanced needs.",
    price: { monthly: null, yearly: null },
    cta: "Contact sales",
    ctaHref: "/contact",
    highlighted: false,
    features: [
      "Everything in Pro",
      "Unlimited seats",
      "SSO / SAML integration",
      "Audit logs & compliance",
      "Dedicated account manager",
      "Custom SLA",
      "On-premise option",
    ],
  },
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="relative py-24 sm:py-32"
    >
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-150 w-150 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/10 blur-6xl"
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-400">
            Pricing
          </p>
          <h2
            id="pricing-heading"
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            Simple,{" "}
            <span className="gradient-text">transparent pricing</span>
          </h2>
          <p className="mt-6 text-lg text-text-secondary">
            Start free. Scale as you grow. No hidden fees, ever.
          </p>
        </div>

        {/* Plans */}
        <div className="mx-auto mt-20 grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              id={plan.id}
              className={`glass-card relative flex flex-col rounded-2xl p-8 transition-all duration-300 ${
                plan.highlighted
                  ? "border-brand-500/50 shadow-glow-brand ring-1 ring-brand-500/50 hover:-translate-y-2"
                  : "hover:-translate-y-1 hover:border-border-default"
              }`}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-4 py-1 text-xs font-semibold text-white"
                  aria-label={`${plan.name} plan is ${plan.badge}`}
                >
                  {plan.badge}
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-text-primary">
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-text-muted">
                  {plan.description}
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  {plan.price.monthly === null ? (
                    <span className="text-4xl font-extrabold text-text-primary">
                      Custom
                    </span>
                  ) : plan.price.monthly === 0 ? (
                    <span className="text-4xl font-extrabold text-text-primary">
                      Free
                    </span>
                  ) : (
                    <>
                      <span className="text-4xl font-extrabold text-text-primary">
                        ${plan.price.monthly}
                      </span>
                      <span className="text-sm text-text-muted">/mo per seat</span>
                    </>
                  )}
                </div>
              </div>

              {/* CTA */}
              <Link
                href={plan.ctaHref}
                id={`${plan.id}-cta`}
                className={`mt-8 block rounded-xl px-6 py-3 text-center text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? "bg-brand-500 text-white shadow-glow-brand hover:bg-brand-400"
                    : "bg-surface-2 text-text-primary hover:bg-surface-3"
                }`}
              >
                {plan.cta}
              </Link>

              {/* Features */}
              <ul
                className="mt-8 flex flex-col gap-3"
                role="list"
                aria-label={`${plan.name} plan features`}
              >
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm text-text-secondary"
                  >
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-400"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Money-back note */}
        <p className="mt-12 text-center text-sm text-text-muted">
          All paid plans include a{" "}
          <strong className="text-text-secondary">30-day money-back guarantee</strong>
          . No questions asked.
        </p>
      </div>
    </section>
  );
}
