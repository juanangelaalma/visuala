export type CheckoutLoadingStateProps = {
    mode?: "preparing" | "verifying";
};

export default function CheckoutLoadingState({ mode = "preparing" }: CheckoutLoadingStateProps) {
    const copy = mode === "verifying"
        ? {
              title: "Verifying your payment",
              description: "Credits will be added automatically after confirmation",
          }
        : {
              title: "Preparing your payment",
              description: "Loading secure payment details",
          };

    return (
        <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
            <div role="status" aria-live="polite" aria-busy="true" className="text-center">
                <div aria-hidden="true" className="mx-auto mb-5 h-2 w-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                <h1 className="text-sm font-semibold tracking-tight text-white">{copy.title}</h1>
                <p className="mt-2 text-xs text-neutral-400">{copy.description}</p>
            </div>
        </main>
    );
}
