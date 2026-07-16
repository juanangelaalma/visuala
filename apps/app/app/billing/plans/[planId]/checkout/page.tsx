import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";
import { listEnabledPaymentMethods } from "@/application/billing/list-enabled-payment-methods";
import { createBillingServices } from "@/application/billing/services";
import { createPricingServices } from "@/application/pricing/services";
import type { PricingPlan } from "@/domain/pricing/types";
import { BillingCheckoutForm } from "@/features/billing/components/BillingCheckoutForm";
import type { BillingPaymentMethodOption } from "@/features/billing/components/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutPageProps = {
  params: Promise<{ planId: string }>;
};

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function Summary({ plan }: { plan: PricingPlan }) {
  const totalCredits = plan.credits + plan.bonusCredits;

  return (
    <aside className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-6 lg:sticky lg:top-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Order summary</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight text-white">{plan.name}</h2>
      <p className="mt-4 font-display text-4xl tracking-tight text-white">{formatPrice(plan.priceAmount, plan.currency)}</p>
      {plan.billingLabel ? <p className="mt-1 text-sm text-neutral-450">{plan.billingLabel}</p> : null}
      <dl className="mt-6 divide-y divide-white/10 border-y border-white/10 text-sm">
        <div className="flex justify-between gap-4 py-3"><dt className="text-neutral-450">Credits</dt><dd className="font-semibold text-white">{plan.credits.toLocaleString("id-ID")}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-neutral-450">Bonus credits</dt><dd className="font-semibold text-primary">{plan.bonusCredits.toLocaleString("id-ID")}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-neutral-450">Total credits</dt><dd className="font-semibold text-white">{totalCredits.toLocaleString("id-ID")}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-neutral-450">Credit validity</dt><dd className="font-semibold text-white">{plan.creditExpiresInDays} days</dd></div>
      </dl>
      {plan.features.length ? <ul className="mt-6 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-3 text-sm leading-6 text-neutral-300"><span aria-hidden="true" className="text-primary">✓</span><span>{feature}</span></li>)}</ul> : null}
    </aside>
  );
}

export default async function PlanCheckoutPage({ params }: CheckoutPageProps) {
  const { planId } = await params;
  if (!UUID_PATTERN.test(planId)) notFound();

  const { authProvider } = await createAuthServices();
  const user = await getCurrentUser(authProvider);
  if (!user) redirect("/login");

  const { pricingPlanRepository } = await createPricingServices();
  const plan = await pricingPlanRepository.findActiveById(planId);
  if (!plan) notFound();

  let methods: BillingPaymentMethodOption[] = [];
  let checkoutAvailable = false;
  let unavailableMessage: string | undefined;

  try {
    const services = await createBillingServices();
    const catalog = await listEnabledPaymentMethods(services.checkout.paymentCatalog);
    methods = catalog.map((method) => ({ id: method.id, kind: method.kind, label: method.label, description: method.description, enabled: method.enabled && (method.kind === "qris" ? services.config.qrisEnabled : method.kind === "virtual_account" ? services.config.virtualAccountEnabled : false) && method.currency === plan.currency && (method.minAmount === null || plan.priceAmount >= method.minAmount) && (method.maxAmount === null || plan.priceAmount <= method.maxAmount), launchPhase: method.launchPhase }));
    checkoutAvailable = services.config.checkoutEnabled && (services.config.qrisEnabled || services.config.virtualAccountEnabled);
    if (!checkoutAvailable) unavailableMessage = "Checkout is temporarily unavailable. Your plan selection is still shown below.";
  } catch {
    unavailableMessage = "Payment methods are temporarily unavailable. Try again later.";
  }

  const eligibleMethods = methods.filter((method) => method.enabled && (method.kind === "qris" || method.kind === "virtual_account") && method.launchPhase === 1);
  const defaultPaymentMethodId = eligibleMethods[0]?.id;

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/billing/plans" className="mb-8 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">‹ Back to plans</Link>
        <header className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Secure checkout</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-white sm:text-5xl">Complete your purchase</h1>
          <p className="mt-3 text-base leading-7 text-neutral-450">Select an available payment method. Your credits are added after payment confirmation.</p>
        </header>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <section aria-labelledby="payment-heading" className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-7">
            <h2 id="payment-heading" className="sr-only">Checkout payment</h2>
            <BillingCheckoutForm key={plan.id} pricingPlanId={plan.id} idempotencyKey={crypto.randomUUID()} methods={methods} defaultPaymentMethodId={defaultPaymentMethodId} checkoutAvailable={checkoutAvailable && eligibleMethods.length > 0} unavailableMessage={unavailableMessage} />
          </section>
          <Summary plan={plan} />
        </div>
      </div>
    </main>
  );
}
