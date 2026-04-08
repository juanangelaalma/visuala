const logos = [
  { name: "Figma", width: 80 },
  { name: "Notion", width: 88 },
  { name: "Linear", width: 76 },
  { name: "Vercel", width: 80 },
  { name: "Stripe", width: 72 },
  { name: "Loom", width: 68 },
];

export default function LogoBand() {
  return (
    <section
      aria-label="Trusted by leading companies"
      className="border-y border-border-subtle bg-surface-1/50 py-12"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <p className="mb-8 text-center text-sm font-medium text-text-muted uppercase tracking-widest">
          Trusted by teams at
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {logos.map(({ name }) => (
            <div
              key={name}
              className="flex items-center justify-center text-lg font-bold text-text-muted/50 transition-colors hover:text-text-muted select-none"
              aria-label={name}
              style={{ minWidth: 72 }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
