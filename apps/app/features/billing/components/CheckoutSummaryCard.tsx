import type { CheckoutSummarySnapshot } from "./types";

type CheckoutSummaryCardProps = {
  snapshot: CheckoutSummarySnapshot;
};

function formatCurrency(amount: number, currency: "IDR") {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function CheckoutSummaryCard({ snapshot }: CheckoutSummaryCardProps) {
  const totalCredits = snapshot.baseCredits + snapshot.bonusCredits;

  return (
    <aside aria-labelledby="checkout-summary-heading" className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-6 lg:sticky lg:top-6">
      <h2 id="checkout-summary-heading" className="text-lg font-semibold text-white">Order summary</h2>
      <dl className="mt-5 space-y-4 text-sm">
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-450">Plan</dt><dd className="text-right font-medium text-white">{snapshot.planName}</dd></div>
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-450">Credits</dt><dd className="text-right font-medium text-white">{totalCredits.toLocaleString("id-ID")}</dd></div>
        {snapshot.bonusCredits > 0 ? <div className="flex items-start justify-between gap-4"><dt className="text-neutral-450">Bonus included</dt><dd className="text-right font-medium text-primary">+{snapshot.bonusCredits.toLocaleString("id-ID")}</dd></div> : null}
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-450">Credit validity</dt><dd className="text-right font-medium text-white">{snapshot.creditExpiresInDays} days</dd></div>
        {snapshot.paymentMethodLabel ? <div className="flex items-start justify-between gap-4"><dt className="text-neutral-450">Payment method</dt><dd className="text-right font-medium text-white">{snapshot.paymentMethodLabel}</dd></div> : null}
        <div className="flex items-end justify-between gap-4 border-t border-white/10 pt-4"><dt className="font-semibold text-white">Total</dt><dd className="text-xl font-semibold text-white">{formatCurrency(snapshot.priceAmount, snapshot.currency)}</dd></div>
      </dl>
    </aside>
  );
}
