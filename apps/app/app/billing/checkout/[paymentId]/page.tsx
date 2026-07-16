import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";
import { getOwnedBillingPayment } from "@/application/billing/get-owned-billing-payment";
import { createBillingServices } from "@/application/billing/services";
import { BillingPaymentNotFoundError } from "@/domain/billing/errors";
import { CheckoutSummaryCard } from "@/features/billing/components/CheckoutSummaryCard";
import { PaymentActionPanel } from "@/features/billing/components/PaymentActionPanel";

type CheckoutPageProps = {
  params: Promise<{ paymentId: string }>;
};

export default async function BillingCheckoutPage({ params }: CheckoutPageProps) {
  const { paymentId } = await params;
  const { authProvider } = await createAuthServices();
  const user = await getCurrentUser(authProvider);
  if (!user) redirect("/login");

  let payment;
  try {
    const services = await createBillingServices();
    payment = await getOwnedBillingPayment(services.payments, { paymentId, userId: user.id });
  } catch (error) {
    if (error instanceof BillingPaymentNotFoundError) notFound();
    return <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white"><p className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300">Payment details are temporarily unavailable. Try again later.</p></main>;
  }

  const actions = payment.latestAttempt?.actions ?? [];
  const expiresAt = payment.latestAttempt?.expiresAt ?? payment.expiresAt;

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/billing/plans" className="mb-8 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">‹ Back to plans</Link>
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <PaymentActionPanel paymentId={payment.id} status={payment.status} actions={actions} expiresAt={expiresAt} />
          <CheckoutSummaryCard snapshot={{ planName: "Credit purchase", priceAmount: payment.priceAmount, currency: payment.currency, baseCredits: payment.baseCredits, bonusCredits: payment.bonusCredits, creditExpiresInDays: payment.creditExpiresInDays, paymentMethodLabel: payment.paymentMethod.label }} />
        </div>
      </div>
    </main>
  );
}
