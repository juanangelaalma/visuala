"use client";

import Link from "next/link";
import type { BillingPaymentProjection } from "@/domain/billing/types";

type PaymentHistoryTableProps = {
  payments: BillingPaymentProjection[];
  total: number;
  page: number;
  pageSize: number;
};

function formatCurrency(amount: number, currency: "IDR") {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const statusStyles: Record<string, string> = {
  paid: "bg-primary/20 text-primary",
  pending: "bg-white/10 text-neutral-300",
  requires_action: "bg-primary/10 text-primary",
  failed: "bg-danger/10 text-danger",
  expired: "bg-danger/10 text-danger",
  cancelled: "bg-white/5 text-neutral-450",
};

const statusLabels: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  requires_action: "Action required",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

function PaymentHistoryRow({ payment }: { payment: BillingPaymentProjection }) {
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="px-4 py-3 text-sm text-white">{formatDate(payment.createdAt)}</td>
      <td className="hidden px-4 py-3 text-sm text-neutral-300 sm:table-cell">{payment.paymentMethod.label}</td>
      <td className="px-4 py-3 text-sm font-medium text-white">{formatCurrency(payment.priceAmount, payment.currency)}</td>
      <td className="hidden px-4 py-3 text-sm text-neutral-300 md:table-cell">{payment.baseCredits + payment.bonusCredits}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[payment.status] ?? "bg-white/10 text-neutral-300"}`}>
          {statusLabels[payment.status] ?? payment.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={`/billing/checkout/${encodeURIComponent(payment.id)}`} className="text-sm font-semibold text-primary hover:text-primary/80">
          View
        </Link>
      </td>
    </tr>
  );
}

export function PaymentHistoryTable({ payments, total, page, pageSize }: PaymentHistoryTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (payments.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-surface p-10 text-center shadow-card-inner">
        <p className="text-neutral-450">No payments yet.</p>
        <Link href="/billing/plans" className="mt-4 inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-primary/90">
          Browse plans
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-card-inner">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-neutral-450">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Method</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Credits</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <PaymentHistoryRow key={payment.id} payment={payment} />
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-neutral-450">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <form>
                <input type="hidden" name="page" value={page - 1} />
                <input type="hidden" name="pageSize" value={pageSize} />
                <button type="submit" className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/5">Previous</button>
              </form>
            ) : null}
            {page < totalPages ? (
              <form>
                <input type="hidden" name="page" value={page + 1} />
                <input type="hidden" name="pageSize" value={pageSize} />
                <button type="submit" className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/5">Next</button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
