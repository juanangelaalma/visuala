import type { BillingEnvironment, BillingPaymentProjection } from "@/domain/billing/types";

export function canSimulateBillingPayment(payment: BillingPaymentProjection, configuredEnvironment: BillingEnvironment): boolean {
  const attempt = payment.latestAttempt;
  const now = Date.now();
  return configuredEnvironment === "test"
    && (!payment.expiresAt || Date.parse(payment.expiresAt) > now)
    && (!attempt?.expiresAt || Date.parse(attempt.expiresAt) > now)
    && Number.isFinite(payment.priceAmount)
    && payment.priceAmount > 0
    && (payment.status === "pending" || payment.status === "requires_action")
    && attempt !== null
    && attempt.environment === "test"
    && attempt.provider === "xendit"
    && Boolean(attempt.providerPaymentId);
}
