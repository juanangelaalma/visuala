import type { PaymentCatalogRepository } from "@/domain/billing/contracts";
import type { PaymentMethod } from "@/domain/billing/types";
import type { PricingPlan } from "@/domain/pricing/types";

export type BillingCheckoutMethod = Pick<PaymentMethod, "id" | "kind" | "label" | "description" | "launchPhase"> & {
  enabled: boolean;
};

type PrepareBillingCheckoutDependencies = {
  paymentCatalog: PaymentCatalogRepository;
  isPaymentMethodEnabled: (method: PaymentMethod) => boolean;
};

type PrepareBillingCheckoutInput = {
  plan: PricingPlan;
  checkoutEnabled: boolean;
};

function isEligible(method: PaymentMethod, plan: PricingPlan, isPaymentMethodEnabled: (method: PaymentMethod) => boolean) {
  const meetsMinimum = method.minAmount === null || plan.priceAmount >= method.minAmount;
  const meetsMaximum = method.maxAmount === null || plan.priceAmount <= method.maxAmount;
  return method.enabled && isPaymentMethodEnabled(method) && method.currency === plan.currency && meetsMinimum && meetsMaximum;
}

function toCheckoutMethod(method: PaymentMethod, plan: PricingPlan, isPaymentMethodEnabled: (method: PaymentMethod) => boolean): BillingCheckoutMethod {
  return { id: method.id, kind: method.kind, label: method.label, description: method.description, enabled: isEligible(method, plan, isPaymentMethodEnabled), launchPhase: method.launchPhase };
}

export async function prepareBillingCheckout(dependencies: PrepareBillingCheckoutDependencies, input: PrepareBillingCheckoutInput) {
  const catalog = await dependencies.paymentCatalog.listEnabled();
  const methods = catalog.map((method) => toCheckoutMethod(method, input.plan, dependencies.isPaymentMethodEnabled));
  const checkoutAvailable = input.checkoutEnabled && methods.some((method) => method.enabled && method.launchPhase === 1);
  return { checkoutAvailable, methods, unavailableMessage: checkoutAvailable ? undefined : "Checkout is temporarily unavailable. Your plan selection is still shown below." };
}
