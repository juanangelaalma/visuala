import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="noise-overlay relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16 text-center lg:px-8"
    >
      {/* Background orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute top-1/4 left-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/20 blur-[120px] animate-pulse-glow" />
        <div className="absolute right-1/4 bottom-1/3 h-80 w-80 translate-x-1/2 rounded-full bg-accent-500/15 blur-[100px] animate-pulse-glow [animation-delay:1.5s]" />
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/10 blur-[160px]" />
      </div>

      {/* Grid lines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(oklch(22%_0.03_250/0.4)_1px,transparent_1px),linear-gradient(90deg,oklch(22%_0.03_250/0.4)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_50%,black,transparent)]"
      />

      {/* Badge */}
      <div className="animate-fade-up mb-8">
        <span
          id="hero-badge"
          className="glass-card inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-brand-300 ring-1 ring-brand-500/30"
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
          Now in public beta — Join 12,000+ designers
        </span>
      </div>

      {/* Heading */}
      <h1
        id="hero-heading"
        className="animate-fade-up mx-auto max-w-4xl text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl [animation-delay:100ms]"
      >
        Design{" "}
        <span className="gradient-text">smarter</span>
        {", "}
        ship{" "}
        <span className="gradient-text">faster</span>
      </h1>

      <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary sm:text-xl [animation-delay:200ms]">
        Visuala is the AI-powered design intelligence platform that unifies your
        design system, accelerates collaboration, and delivers pixel-perfect
        handoffs — all in one place.
      </p>

      {/* CTAs */}
      <div className="animate-fade-up mt-10 flex flex-col items-center gap-4 sm:flex-row [animation-delay:300ms]">
        <Link
          href="/signup"
          id="hero-cta-primary"
          className="group relative overflow-hidden rounded-xl bg-brand-500 px-8 py-4 text-base font-semibold text-white shadow-glow-brand transition-all hover:bg-brand-400 hover:scale-105 active:scale-100"
        >
          <span className="relative z-10">Start for free</span>
          <span
            aria-hidden="true"
            className="animate-shimmer absolute inset-0 opacity-0 group-hover:opacity-100"
          />
        </Link>
        <a
          href="#how-it-works"
          id="hero-cta-secondary"
          className="flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold text-text-secondary ring-1 ring-border-default transition-all hover:ring-border-default hover:bg-surface-2 hover:text-text-primary"
        >
          See how it works
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M8 3.293l4.854 4.853a1 1 0 010 1.414L8 13.707 6.586 12.293l3.293-3.293H2V7h7.879L6.586 3.707 8 2.293z"
            />
          </svg>
        </a>
      </div>

      {/* Trust bar */}
      <p className="animate-fade-up mt-14 text-xs text-text-muted [animation-delay:400ms]">
        No credit card required · Cancel anytime · SOC 2 Type II certified
      </p>

      {/* Hero image placeholder */}
      <div className="animate-fade-up animate-float mx-auto mt-16 w-full max-w-5xl [animation-delay:500ms]">
        <div className="glass-card relative overflow-hidden rounded-2xl border-border-subtle shadow-2xl">
          {/* Fake browser chrome */}
          <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1/80 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-500/60" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
            <span className="h-3 w-3 rounded-full bg-green-500/60" />
            <div className="mx-4 h-5 flex-1 rounded-md bg-surface-2" />
          </div>
          {/* App UI skeleton */}
          <div className="flex h-80 gap-0">
            {/* Sidebar */}
            <div className="flex w-48 flex-col gap-2 border-r border-border-subtle bg-surface-1/60 p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-8 rounded-lg ${i === 2 ? "bg-brand-500/30" : "bg-surface-2"}`}
                />
              ))}
            </div>
            {/* Canvas */}
            <div className="relative flex-1 bg-surface-0/40 p-8">
              <div className="grid h-full grid-cols-2 gap-4">
                <div className="rounded-xl bg-surface-2/60 p-4">
                  <div className="mb-3 h-4 w-24 rounded bg-surface-3" />
                  <div className="h-20 rounded-lg bg-linear-to-br from-brand-500/20 to-accent-500/20" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-3 w-16 rounded bg-surface-3" />
                    <div className="h-3 w-10 rounded bg-surface-3" />
                  </div>
                </div>
                <div className="rounded-xl bg-surface-2/60 p-4">
                  <div className="mb-3 h-4 w-20 rounded bg-surface-3" />
                  <div className="flex gap-2">
                    {["bg-brand-400/50", "bg-accent-400/50", "bg-brand-300/50"].map(
                      (c, i) => (
                        <div key={i} className={`h-8 w-8 rounded-full ${c}`} />
                      )
                    )}
                  </div>
                  <div className="mt-4 h-14 rounded-lg bg-surface-3/60" />
                </div>
              </div>
              {/* Floating badge */}
              <div className="glass-card absolute right-6 bottom-6 rounded-xl px-3 py-2 text-xs text-accent-400">
                ✨ AI suggestion ready
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
