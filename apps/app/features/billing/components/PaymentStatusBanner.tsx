import type { BillingPaymentStatus } from "@/domain/billing/types";

type PaymentStatusBannerProps = { status: BillingPaymentStatus };

const content: Record<BillingPaymentStatus, { title: string; detail: string; tone: string }> = {
  pending: { title: "Payment pending", detail: "Complete the payment, then refresh the status.", tone: "border-white/10 bg-white/5" },
  requires_action: { title: "Action required", detail: "Follow the payment instructions below.", tone: "border-primary/40 bg-primary/10" },
  paid: { title: "Payment confirmed", detail: "Your payment was received. Credits will appear after processing.", tone: "border-primary/40 bg-primary/10" },
  failed: { title: "Payment failed", detail: "This payment could not be completed. Start a new checkout to try again.", tone: "border-danger/40 bg-danger/10" },
  expired: { title: "Payment expired", detail: "Start a new checkout to continue.", tone: "border-danger/40 bg-danger/10" },
  cancelled: { title: "Payment cancelled", detail: "This payment is no longer active. Start a new checkout when ready.", tone: "border-white/10 bg-white/5" },
};

export function PaymentStatusBanner({ status }: PaymentStatusBannerProps) {
  const item = content[status];
  return <div role="status" className={`rounded-2xl border px-4 py-3 ${item.tone}`}><p className="text-sm font-semibold text-white">{item.title}</p><p className="mt-1 text-sm text-neutral-300">{item.detail}</p></div>;
}
