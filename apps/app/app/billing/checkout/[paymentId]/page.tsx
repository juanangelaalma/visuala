import Link from "next/link";
import { notFound } from "next/navigation";
import type { BillingPaymentProjection } from "@/domain/billing/types";
import { CheckoutSummaryCard } from "@/features/billing/components/CheckoutSummaryCard";
import { PaymentActionPanel } from "@/features/billing/components/PaymentActionPanel";
import { ApiError, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

type CheckoutPageProps = {
  params: Promise<{ paymentId: string }>;
};

type BillingPaymentResponse = {
  payment: BillingPaymentProjection;
  canSimulate: boolean;
};

export default async function BillingCheckoutPage({ params }: CheckoutPageProps) {
  const { paymentId } = await params;
  await requireUser();

  let payment: BillingPaymentProjection;
  let canSimulate: boolean;
  try {
    const result = await apiFetch<BillingPaymentResponse>(`/billing/payments/${encodeURIComponent(paymentId)}`);
    payment = result.payment;
    canSimulate = result.canSimulate;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white"><p className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300">Payment details are temporarily unavailable. Try again later.</p></main>;
  }

  const actions = payment.latestAttempt?.actions ?? [];
  const expiresAt = payment.latestAttempt?.expiresAt ?? payment.expiresAt;

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/billing/plans" className="mb-8 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">‹ Back to plans</Link>
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <PaymentActionPanel paymentId={payment.id} status={payment.status} actions={actions} expiresAt={expiresAt} canSimulate={canSimulate} />
          <CheckoutSummaryCard snapshot={{ planName: "Credit purchase", priceAmount: payment.priceAmount, currency: payment.currency, baseCredits: payment.baseCredits, bonusCredits: payment.bonusCredits, creditExpiresInDays: payment.creditExpiresInDays, paymentMethodLabel: payment.paymentMethod.label }} />
        </div>
      </div>
    </main>
  );
}
