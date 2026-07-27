import type { BillingEnvironment, BillingPayment, BillingPaymentProjection, BillingProvider, PaymentMethod, ProviderAttempt, WebhookCandidate, WebhookFulfillmentOutcome, WebhookReceipt, NormalizedWebhook } from "./types";

export type SimulateBillingPaymentInput = {
  providerPaymentId: string;
  amount: number;
};

export type CreateBillingPaymentInput = {
  userId: string;
  pricingPlanId: string;
  selectedPaymentMethodId: string;
  idempotencyKey: string;
  priceAmount: number;
  currency: "IDR";
  baseCredits: number;
  bonusCredits: number;
  creditExpiresInDays: number;
};

export interface PaymentCatalogRepository {
  listEnabled(): Promise<PaymentMethod[]>;
  findEnabledById(id: string, amount: number, currency: "IDR"): Promise<PaymentMethod | null>;
}

export type ListOwnedBillingPaymentsInput = {
  userId: string;
  offset: number;
  limit: number;
};

export type ListOwnedBillingPaymentsResult = {
  payments: BillingPaymentProjection[];
  total: number;
};

export interface BillingPaymentRepository {
  createIdempotently(input: CreateBillingPaymentInput): Promise<{ payment: BillingPayment; created: boolean }>;
  findOwnedProjection(id: string, userId: string): Promise<BillingPaymentProjection | null>;
  listOwnedProjections(input: ListOwnedBillingPaymentsInput): Promise<ListOwnedBillingPaymentsResult>;
}

export type TrustedProviderAllocation = {
  paymentMethodId: string;
  provider: BillingProvider;
  environment: BillingEnvironment;
  providerReference: string;
  providerIdempotencyKey: string;
};

export interface ProviderAllocationService {
  allocate(input: { billingPaymentId: string; paymentMethod: PaymentMethod; clientIdempotencyKey: string }): Promise<TrustedProviderAllocation>;
}

export interface ProviderAttemptRepository {
  allocate(input: { billingPaymentId: string } & TrustedProviderAllocation): Promise<ProviderAttempt>;
  markUnknown(attemptId: string): Promise<void>;
  saveProviderResult(attemptId: string, result: { providerPaymentId: string; status: ProviderAttempt["status"]; actions: ProviderAttempt["actions"]; expiresAt: string | null }): Promise<ProviderAttempt>;
}

export interface BillingGateway {
  createCheckout(attempt: ProviderAttempt, payment: BillingPayment, method: PaymentMethod): Promise<{ providerPaymentId: string; status: ProviderAttempt["status"]; actions: ProviderAttempt["actions"]; expiresAt: string | null }>;
  simulatePayment(input: SimulateBillingPaymentInput): Promise<void>;
}

export interface BillingGatewayResolver {
  resolve(provider: BillingProvider, environment: BillingEnvironment): BillingGateway;
}

export interface BillingWebhookRepository {
  receive(webhook: NormalizedWebhook): Promise<WebhookReceipt>;
  listCandidates(limit: number): Promise<WebhookCandidate[]>;
  fulfill(eventId: string): Promise<WebhookFulfillmentOutcome>;
  recordFailure(eventId: string, sanitizedError: string, policy: { maxAttempts: number; baseDelaySeconds: number; maxDelaySeconds: number }): Promise<boolean>;
}

export interface ManualBillingReconciliationRepository {
  fulfillVerifiedFailedSettlement(eventId: string, authorization: { authorizedByUserId: string; reason: string }): Promise<WebhookFulfillmentOutcome>;
}
