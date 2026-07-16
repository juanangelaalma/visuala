import type { CheckoutSummary } from "./payment-types";

export type PaymentSummaryCardProps = {
    summary: CheckoutSummary;
    status?: "pending" | "paid" | "expired" | "failed";
};

function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}

function statusLabel(status?: PaymentSummaryCardProps["status"]) {
    switch (status) {
        case "paid":
            return "Payment confirmed";
        case "expired":
            return "Expired";
        case "failed":
            return "Failed";
        default:
            return "Pending payment";
    }
}

export default function PaymentSummaryCard({ summary, status = "pending" }: PaymentSummaryCardProps) {
    const totalCredits = summary.credits + summary.bonusCredits;
    const fees = summary.feesAmount ?? 0;

    return (
        <aside className="rounded-3xl border border-white/10 bg-surface p-6 shadow-sm lg:sticky lg:top-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-white">{summary.planName}</h2>
                    <p className="mt-2 text-sm text-neutral-400">{formatNumber(totalCredits)} credits included</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{statusLabel(status)}</span>
            </div>

            <div className="mb-6 space-y-3 border-b border-white/10 pb-6">
                <p className="text-sm font-medium text-white">Top features</p>
                <ul className="space-y-3">
                    {summary.benefits.map((benefit) => (
                        <li key={benefit} className="flex gap-3 text-sm leading-5 text-neutral-300">
                            <span className="text-primary" aria-hidden="true">✦</span>
                            <span>{benefit}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4 text-neutral-400">
                    <dt>Credits</dt>
                    <dd>{formatNumber(summary.credits)}</dd>
                </div>
                {summary.bonusCredits > 0 ? (
                    <div className="flex items-center justify-between gap-4 text-neutral-400">
                        <dt>Bonus credits</dt>
                        <dd>{formatNumber(summary.bonusCredits)}</dd>
                    </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 text-neutral-400">
                    <dt>Expires in</dt>
                    <dd>{summary.creditExpiresInDays} days</dd>
                </div>
                <div className="flex items-center justify-between gap-4 pt-3 text-neutral-400">
                    <dt>Subtotal</dt>
                    <dd>{formatCurrency(summary.amount, summary.currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 text-neutral-400">
                    <dt>Estimated fees</dt>
                    <dd>{formatCurrency(fees, summary.currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4 font-semibold text-white">
                    <dt>Due today</dt>
                    <dd>{formatCurrency(summary.dueTodayAmount, summary.currency)}</dd>
                </div>
            </dl>

            <p className="mt-6 text-xs leading-5 text-neutral-400">Credits are granted only after verified payment confirmation from Xendit. Closing this page will not cancel a pending payment.</p>
        </aside>
    );
}
