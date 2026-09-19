export type BillingProvider = string;
export type BillingEnvironment = "test" | "production";
export type Currency = "IDR";
export type PaymentMethodKind = "qris" | "virtual_account" | "ewallet";
export type BillingPaymentStatus = "pending" | "requires_action" | "paid" | "failed" | "expired" | "cancelled";
export type ProviderAttemptStatus = "creating" | "unknown" | "requires_action" | "pending" | "failed" | "expired" | "paid";
export type NormalizedWebhookStatus = BillingPaymentStatus | "ignored" | "requires_review";

export type CheckoutAction =
  | { type: "qr_code"; value: string; expiresAt: string | null }
  | { type: "redirect"; url: string; expiresAt: string | null }
  | { type: "deep_link"; url: string; expiresAt: string | null }
  | { type: "virtual_account"; accountNumber: string; bankCode: string; expiresAt: string | null };

export type PaymentMethod = {
  id: string;
  slug: string;
  kind: PaymentMethodKind;
  label: string;
  description: string | null;
  logoUrl: string | null;
  currency: Currency;
  minAmount: number | null;
  maxAmount: number | null;
  enabled: boolean;
  launchPhase: number;
  sortOrder: number;
};

export type BillingPayment = {
  id: string;
  userId: string;
  pricingPlanId: string;
  selectedPaymentMethodId: string;
  idempotencyKey: string;
  status: BillingPaymentStatus;
  priceAmount: number;
  currency: Currency;
  baseCredits: number;
  bonusCredits: number;
  creditExpiresInDays: number;
  expiresAt: string | null;
  paidAt: string | null;
  settlementAuditCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderAttempt = {
  id: string;
  billingPaymentId: string;
  paymentMethodId: string;
  provider: BillingProvider;
  environment: BillingEnvironment;
  providerMethodType: string;
  providerChannelCode: string;
  mappingConfig: unknown;
  providerReference: string;
  providerIdempotencyKey: string;
  providerPaymentId: string | null;
  status: ProviderAttemptStatus;
  actions: CheckoutAction[];
  expiresAt: string | null;
};

export type BillingPaymentProjection = BillingPayment & {
  paymentMethod: PaymentMethod;
  latestAttempt: ProviderAttempt | null;
};

export type NormalizedWebhook = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  deduplicationKey: string;
  eventType: string;
  status: NormalizedWebhookStatus;
  providerReference: string;
  providerPaymentId: string;
  amount: number;
  currency: Currency;
  occurredAt: string;
};

export type WebhookReceipt = { eventId: string; duplicate: boolean };
export type WebhookCandidate = { eventId: string };
export type WebhookFulfillmentOutcome = "retryable" | "fulfilled" | "duplicate_paid" | "quarantined_requires_review" | "quarantined_paid_after_failed" | "quarantined_paid_after_cancelled" | "already_paid" | "stale_attempt_observation" | "terminal_observation" | "requires_action" | "no_op";
