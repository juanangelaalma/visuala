import Link from "next/link";

export type PaymentVerificationStateProps = {
    state?: "verifying" | "credited" | "expired" | "failed";
    credits?: number;
    walletBalance?: number;
    dashboardHref?: string;
};

function formatNumber(value: number) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}

export default function PaymentVerificationState({ state = "verifying", credits, walletBalance, dashboardHref = "/dashboard" }: PaymentVerificationStateProps) {
    const content = {
        verifying: {
            title: "Payment is being verified",
            description: "Credits will be added automatically after your payment provider confirms the payment.",
            badge: "Verification pending",
        },
        credited: {
            title: "Credits added",
            description: credits ? `${formatNumber(credits)} credits are now available in your wallet.` : "Your credits are now available in your wallet.",
            badge: "Credits granted",
        },
        expired: {
            title: "Payment expired",
            description: "This payment has expired. Choose a plan again to create a new payment.",
            badge: "Expired",
        },
        failed: {
            title: "Payment failed",
            description: "The payment could not be completed. Choose a plan again or try another available payment method.",
            badge: "Failed",
        },
    }[state];
    const actionLabel = state === "credited" ? "Go to dashboard" : state === "verifying" ? "Check dashboard" : "Choose another plan";
    const actionHref = state === "expired" || state === "failed" ? "/billing/plans" : dashboardHref;

    return (
        <main className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
            <section className="w-full max-w-md rounded-3xl border border-white/10 bg-surface p-8 text-center shadow-sm">
                <span className="mb-5 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{content.badge}</span>
                <h1 className="text-2xl font-semibold tracking-tight text-white">{content.title}</h1>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{content.description}</p>
                {walletBalance !== undefined ? <p className="mt-6 rounded-2xl bg-black/30 p-4 text-sm font-medium text-white">Wallet balance: {formatNumber(walletBalance)} credits</p> : null}
                <Link href={actionHref} className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-black transition hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none">
                    {actionLabel}
                </Link>
            </section>
        </main>
    );
}
