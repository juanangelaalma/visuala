const testimonials = [
  {
    id: "testimonial-1",
    quote:
      "Visuala cut our design-to-dev handoff time in half. The code generation is scarily accurate — our engineers actually love it.",
    author: "Sarah Chen",
    role: "Head of Design",
    company: "Streamline Inc.",
    avatar: "SC",
    accentColor: "bg-brand-500",
  },
  {
    id: "testimonial-2",
    quote:
      "Finally, one place where designers and developers speak the same language. The design system sync is a game changer.",
    author: "Marcus Reid",
    role: "Lead Engineer",
    company: "NovaBuild",
    avatar: "MR",
    accentColor: "bg-accent-500",
  },
  {
    id: "testimonial-3",
    quote:
      "The AI suggestions caught inconsistencies in our component library that we'd been ignoring for months. Incredible.",
    author: "Priya Nair",
    role: "Product Designer",
    company: "Flowstate",
    avatar: "PN",
    accentColor: "bg-purple-500",
  },
];

export default function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="bg-surface-1/50 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent-400">
            Testimonials
          </p>
          <h2
            id="testimonials-heading"
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            Loved by{" "}
            <span className="gradient-text">thousands of teams</span>
          </h2>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.id}
              id={t.id}
              className="glass-card rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-border-default"
            >
              {/* Stars */}
              <div className="mb-4 flex gap-1" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    className="h-4 w-4 text-amber-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <blockquote className="text-sm leading-relaxed text-text-secondary">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <figcaption className="mt-6 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t.accentColor} text-xs font-bold text-white`}
                  aria-hidden="true"
                >
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{t.author}</p>
                  <p className="text-xs text-text-muted">
                    {t.role} · {t.company}
                  </p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* Stats */}
        <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-8 sm:grid-cols-4">
          {[
            { label: "Teams using Visuala", value: "12,000+" },
            { label: "Components shipped", value: "4M+" },
            { label: "Time saved per sprint", value: "8 hrs" },
            { label: "Customer satisfaction", value: "98%" },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <dt className="text-sm text-text-muted">{label}</dt>
              <dd className="mt-1 text-3xl font-extrabold gradient-text">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
