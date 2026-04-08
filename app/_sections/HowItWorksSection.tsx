const steps = [
  {
    id: "step-1",
    number: "01",
    title: "Connect your tools",
    description:
      "Import your existing Figma files, link your GitHub repo, and connect with your team's workflow in minutes.",
  },
  {
    id: "step-2",
    number: "02",
    title: "Build your design system",
    description:
      "Organize tokens, components, and patterns in one unified hub that stays in sync with your codebase automatically.",
  },
  {
    id: "step-3",
    number: "03",
    title: "Collaborate in real-time",
    description:
      "Designers and developers work together on the same canvas. Comment, review, and iterate without context switching.",
  },
  {
    id: "step-4",
    number: "04",
    title: "Ship with confidence",
    description:
      "Export production-ready code, share spec links, and track changes. Your design and code stay perfectly aligned.",
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="hiw-heading"
      className="relative overflow-hidden bg-surface-1/50 py-24 sm:py-32"
    >
      {/* Decorative element */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/2 h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full bg-brand-500/10 blur-[100px]"
      />

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent-400">
            How it works
          </p>
          <h2
            id="hiw-heading"
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            Up and running in{" "}
            <span className="gradient-text">under 10 minutes</span>
          </h2>
          <p className="mt-6 text-lg text-text-secondary">
            No complex setup or onboarding. Just connect, build, and ship.
          </p>
        </div>

        {/* Steps */}
        <ol
          className="relative mx-auto mt-20 max-w-4xl"
          aria-label="Getting started steps"
        >
          {/* Connecting line */}
          <div
            className="absolute left-8 top-8 bottom-8 w-px bg-linear-to-b from-brand-500 via-accent-500 to-transparent"
            aria-hidden="true"
          />

          {steps.map((step, i) => (
            <li
              key={step.id}
              id={step.id}
              className={`relative flex gap-8 ${i !== steps.length - 1 ? "pb-14" : ""}`}
            >
              {/* Step number */}
              <div
                className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-2 ring-1 ring-brand-500/50 text-sm font-bold text-brand-400"
                aria-hidden="true"
              >
                {step.number}
              </div>

              {/* Content */}
              <div className="glass-card flex-1 rounded-2xl p-6 transition-all duration-300 hover:border-brand-500/30">
                <h3 className="mb-2 text-xl font-semibold text-text-primary">
                  {step.title}
                </h3>
                <p className="text-text-secondary leading-relaxed">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
