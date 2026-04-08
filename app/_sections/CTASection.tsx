import Link from "next/link";

export default function CTASection() {
  return (
    <section
      id="cta"
      aria-labelledby="cta-heading"
      className="relative overflow-hidden py-24 sm:py-32"
    >
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/15 blur-[150px]" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-[100px]" />
      </div>

      {/* Decorative ring */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/10 animate-spin-slow"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/5 animate-spin-slow [animation-duration:30s] [animation-direction:reverse]"
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center lg:px-8">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-300 ring-1 ring-brand-500/20">
          <span className="animate-pulse-glow inline-block h-1.5 w-1.5 rounded-full bg-accent-400" />
          Free forever on Starter — No credit card required
        </div>

        <h2
          id="cta-heading"
          className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
        >
          Ready to build{" "}
          <span className="gradient-text">something great?</span>
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
          Join over 12,000 design teams already using Visuala to ship faster,
          collaborate better, and build design systems that scale.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            id="cta-primary"
            className="group relative overflow-hidden rounded-xl bg-brand-500 px-10 py-4 text-base font-semibold text-white shadow-glow-brand transition-all hover:bg-brand-400 hover:scale-105 active:scale-100"
          >
            <span className="relative z-10">Start for free — no card needed</span>
            <span
              aria-hidden="true"
              className="animate-shimmer absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </Link>
          <Link
            href="/contact"
            id="cta-secondary"
            className="rounded-xl px-10 py-4 text-base font-semibold text-text-secondary ring-1 ring-border-default transition-all hover:bg-surface-2 hover:text-text-primary"
          >
            Talk to sales
          </Link>
        </div>

        {/* Trust signals */}
        <ul
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-muted"
          role="list"
          aria-label="Trust signals"
        >
          {[
            "SOC 2 Type II",
            "GDPR compliant",
            "SSO / SAML",
            "99.9% uptime SLA",
            "Cancel anytime",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-accent-400"
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
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
