export class BillingError extends Error {}
export class PricingPlanUnavailableError extends BillingError {}
export class PaymentMethodUnavailableError extends BillingError {}
export class BillingPaymentNotFoundError extends BillingError {}
export class BillingPaymentOwnershipError extends BillingError {}
export class ActiveProviderAttemptError extends BillingError {}
export class UnknownProviderAttemptError extends BillingError {}
export class WebhookDeduplicationConflictError extends BillingError {}
export class BillingIdempotencyConflictError extends BillingError {
  name = "BillingIdempotencyConflictError";
}
export class BillingCheckoutIndeterminateError extends BillingError {
  constructor(public readonly attemptId: string, options?: ErrorOptions) {
    super(`Billing checkout outcome is indeterminate for attempt ${attemptId}`, options);
  }
}
