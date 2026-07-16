export default function PlanCheckoutLoading() {
  return (
    <main className="min-h-screen bg-black px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 h-11 w-36 rounded-full bg-neutral-900" />
        <div className="mb-8 space-y-3">
          <div className="h-3 w-28 rounded-full bg-primary/15" />
          <div className="h-12 max-w-xl rounded-2xl bg-neutral-900" />
          <div className="h-5 max-w-2xl rounded-full bg-neutral-950" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-80 rounded-3xl border border-neutral-800 bg-surface" />
          <div className="h-96 rounded-3xl border border-neutral-800 bg-surface" />
        </div>
      </div>
    </main>
  );
}
