import type { BillingGateway, BillingGatewayResolver, BillingPaymentRepository, CreateBillingPaymentInput, PaymentCatalogRepository, ProviderAllocationService, ProviderAttemptRepository } from "@/domain/billing/contracts";
import { BillingCheckoutIndeterminateError, BillingIdempotencyConflictError, PaymentMethodUnavailableError, PricingPlanUnavailableError } from "@/domain/billing/errors";
import type { BillingPayment, PaymentMethod, ProviderAttempt } from "@/domain/billing/types";
import type { PricingPlanRepository } from "@/domain/pricing/pricing-plan-repository";
import type { PricingPlan } from "@/domain/pricing/types";

type CreateBillingCheckoutDependencies = {
  pricingPlans: PricingPlanRepository;
  paymentCatalog: PaymentCatalogRepository;
  payments: BillingPaymentRepository;
  providerAllocation: ProviderAllocationService;
  attempts: ProviderAttemptRepository;
  gateways: BillingGatewayResolver;
};

type CreateBillingCheckoutInput = {
  userId: string;
  pricingPlanId: string;
  paymentMethodCatalogId: string;
  idempotencyKey: string;
};

function buildPaymentSnapshot(input: CreateBillingCheckoutInput, plan: PricingPlan, method: PaymentMethod): CreateBillingPaymentInput {
  return {
    userId: input.userId,
    pricingPlanId: plan.id,
    selectedPaymentMethodId: method.id,
    idempotencyKey: input.idempotencyKey,
    priceAmount: plan.priceAmount,
    currency: "IDR",
    baseCredits: plan.credits,
    bonusCredits: plan.bonusCredits,
    creditExpiresInDays: plan.creditExpiresInDays,
  };
}

function paymentMatchesSnapshot(payment: BillingPayment, snapshot: CreateBillingPaymentInput) {
  return (
    payment.userId === snapshot.userId &&
    payment.pricingPlanId === snapshot.pricingPlanId &&
    payment.selectedPaymentMethodId === snapshot.selectedPaymentMethodId &&
    payment.priceAmount === snapshot.priceAmount &&
    payment.currency === snapshot.currency &&
    payment.baseCredits === snapshot.baseCredits &&
    payment.bonusCredits === snapshot.bonusCredits &&
    payment.creditExpiresInDays === snapshot.creditExpiresInDays
  );
}

async function markUnknownBestEffort(attempts: ProviderAttemptRepository, attemptId: string) {
  try {
    await attempts.markUnknown(attemptId);
  } catch {}
}

async function executeProviderCheckout(gateway: BillingGateway, attempts: ProviderAttemptRepository, attempt: ProviderAttempt, payment: BillingPayment, method: PaymentMethod) {
  try {
    const result = await gateway.createCheckout(attempt, payment, method);
    await attempts.saveProviderResult(attempt.id, result);
  } catch (error) {
    await markUnknownBestEffort(attempts, attempt.id);
    throw new BillingCheckoutIndeterminateError(attempt.id, { cause: error });
  }
}

export async function createBillingCheckout(dependencies: CreateBillingCheckoutDependencies, input: CreateBillingCheckoutInput) {
  const plan = await dependencies.pricingPlans.findActiveById(input.pricingPlanId);
  if (!plan || plan.currency !== "IDR") throw new PricingPlanUnavailableError("Pricing plan unavailable");

  const method = await dependencies.paymentCatalog.findEnabledById(input.paymentMethodCatalogId, plan.priceAmount, "IDR");
  if (!method) throw new PaymentMethodUnavailableError("Payment method unavailable");

  const snapshot = buildPaymentSnapshot(input, plan, method);
  const creation = await dependencies.payments.createIdempotently(snapshot);
  if (!creation.created) {
    if (!paymentMatchesSnapshot(creation.payment, snapshot)) throw new BillingIdempotencyConflictError("Idempotency key payload conflict");
    return dependencies.payments.findOwnedProjection(creation.payment.id, input.userId);
  }

  const allocation = await dependencies.providerAllocation.allocate({ billingPaymentId: creation.payment.id, paymentMethod: method, clientIdempotencyKey: input.idempotencyKey });
  const attempt = await dependencies.attempts.allocate({ billingPaymentId: creation.payment.id, ...allocation });
  const gateway = dependencies.gateways.resolve(attempt.provider, attempt.environment);
  await executeProviderCheckout(gateway, dependencies.attempts, attempt, creation.payment, method);

  return dependencies.payments.findOwnedProjection(creation.payment.id, input.userId);
}
