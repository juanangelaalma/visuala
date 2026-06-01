import BaseVideo from "../_components/BaseVideo";

const features = [
  {
    id: "feature-ai-design",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
    title: "AI Design Assistant",
    description:
      "Generate component variants, suggest accessible colors, and write design tokens automatically — powered by a model trained on design patterns.",
    color: "from-brand-500/20 to-brand-400/10",
    accentColor: "text-brand-400",
    videoSrc: "/videos/features/Elegant_woman_wearing_white_blazer_202605281645.mp4",
  },
  {
    id: "feature-design-system",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
      </svg>
    ),
    title: "Unified Design System",
    description:
      "One source of truth for your entire team. Tokens, components, and documentation live together and stay perfectly in sync.",
    color: "from-accent-500/20 to-accent-400/10",
    accentColor: "text-accent-400",
    videoSrc: "/videos/features/Unboxing.mp4",
  },
  {
    id: "feature-collaboration",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    title: "Real-time Collaboration",
    description:
      "See cursors, comments, and edits as they happen. Multiplayer design that eliminates endless Slack threads and version confusion.",
    color: "from-purple-500/20 to-purple-400/10",
    accentColor: "text-purple-400",
    videoSrc: "/videos/features/Hands_lifting_smartphone_out_box_202605281645.mp4",
  },
  {
    id: "feature-handoff",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    title: "Pixel-perfect Handoff",
    description:
      "Auto-generate React, Tailwind, and CSS-in-JS code from any design. Developers get specs, assets, and style guides instantly.",
    color: "from-orange-500/20 to-orange-400/10",
    accentColor: "text-orange-400",
    videoSrc: "/videos/features/Woman_applying_facial_serum_202605281645.mp4",
  },
  {
    id: "feature-analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: "Design Analytics",
    description:
      "Understand which components are used most, spot inconsistencies, and track how your design system evolves over time.",
    color: "from-cyan-500/20 to-cyan-400/10",
    accentColor: "text-cyan-400",
    videoSrc: "/videos/features/Elegant_woman_wearing_white_blazer_202605281645.mp4",
  },
  {
    id: "feature-integrations",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    title: "50+ Integrations",
    description:
      "Connect with Figma, GitHub, Jira, Storybook, and the tools your team already loves. No workflow disruption.",
    color: "from-pink-500/20 to-pink-400/10",
    accentColor: "text-pink-400",
    videoSrc: "/videos/features/Hands_lifting_smartphone_out_box_202605281645.mp4",
  },
];

export default function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="relative py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-400">
            Features
          </p>
          <h2
            id="features-heading"
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            Everything your team needs
            <br />
            <span className="gradient-text">in one platform</span>
          </h2>
          <p className="mt-6 text-lg text-text-secondary">
            Stop juggling twelve tools. Visuala brings design, code, and
            collaboration together so you can focus on what matters.
          </p>
        </div>

        {/* Feature grid */}
        <div
          className="mx-auto mt-20 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Platform features"
        >
          {features.map((feature) => (
            <article
              key={feature.id}
              id={feature.id}
              className="glass-card group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-glow-brand"
              role="listitem"
            >
              {/* Gradient bg on hover */}
              <div
                className={`absolute inset-0 -z-10 bg-linear-to-br ${feature.color} opacity-0 transition-opacity group-hover:opacity-100`}
                aria-hidden="true"
              />

              {/* Icon */}
              <div
                className={`mb-4 inline-flex rounded-xl bg-surface-2 p-3 ${feature.accentColor}`}
              >
                {feature.icon}
              </div>

              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                {feature.description}
              </p>

              <div className="mt-6 aspect-video overflow-hidden rounded-xl border border-white/10 bg-surface-2">
                <BaseVideo
                  src={feature.videoSrc}
                  ariaLabel={`${feature.title} feature video`}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  lazy
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
