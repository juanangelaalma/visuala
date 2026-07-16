import { describe, expect, it, vi } from "vitest";
import type { BillingGateway, BillingPaymentRepository, BillingWebhookRepository, PaymentCatalogRepository, ProviderAttemptRepository } from "@/domain/billing/contracts";
import { BillingIdempotencyConflictError, PaymentMethodUnavailableError } from "@/domain/billing/errors";
import type { BillingPayment, BillingPaymentProjection, PaymentMethod, ProviderAttempt } from "@/domain/billing/types";
import type { PricingPlanRepository } from "@/domain/pricing/pricing-plan-repository";
import type { PricingPlan } from "@/domain/pricing/types";
import { createBillingCheckout } from "./create-billing-checkout";
import { prepareBillingCheckout } from "./prepare-billing-checkout";
import { receiveBillingWebhook } from "./receive-billing-webhook";
import { refreshOwnedBillingPayment, toBillingRefreshProjection } from "./refresh-owned-billing-payment";

const payment: BillingPayment = { id: "payment-1", userId: "user-1", pricingPlanId: "plan-1", selectedPaymentMethodId: "method-1", idempotencyKey: "key-1", status: "pending", priceAmount: 10000, currency: "IDR", baseCredits: 100, bonusCredits: 10, creditExpiresInDays: 30, expiresAt: null, paidAt: null, settlementAuditCode: null, createdAt: "now", updatedAt: "now" };
const method: PaymentMethod = { id: "method-1", slug: "qris", kind: "qris", label: "QRIS", description: null, logoUrl: null, currency: "IDR", minAmount: null, maxAmount: null, enabled: true, launchPhase: 1, sortOrder: 1 };
const attempt: ProviderAttempt = { id: "attempt-1", billingPaymentId: payment.id, paymentMethodId: method.id, provider: "provider", environment: "test", providerMethodType: "QR_CODE", providerChannelCode: "QRIS", mappingConfig: {}, providerReference: "ref", providerIdempotencyKey: "provider-key", providerPaymentId: null, status: "creating", actions: [], expiresAt: null };
const projection: BillingPaymentProjection = { ...payment, paymentMethod: method, latestAttempt: attempt };
const plan: PricingPlan = { id: "plan-1", slug: "starter", name: "Starter", priceAmount: 10000, currency: "IDR", billingPeriod: "monthly", billingLabel: "per month", compareAtAmount: null, badgeLabel: null, ctaLabel: "Choose plan", credits: 100, bonusCredits: 10, creditExpiresInDays: 30, features: [], isActive: true, isMostPopular: false, sortOrder: 1, createdAt: "now", updatedAt: "now" };

function dependencies(created = true) {
  const pricingPlans = { findActiveById: vi.fn().mockResolvedValue({ id: "plan-1", currency: "IDR", priceAmount: 10000, credits: 100, bonusCredits: 10, creditExpiresInDays: 30 }), listActive: vi.fn(), listAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } as PricingPlanRepository;
  const paymentCatalog = { listEnabled: vi.fn(), findEnabledById: vi.fn().mockResolvedValue(method) } as PaymentCatalogRepository;
  const payments = { createIdempotently: vi.fn().mockResolvedValue({ payment, created }), findOwnedProjection: vi.fn().mockResolvedValue(projection) } as BillingPaymentRepository;
  const attempts = { allocate: vi.fn().mockResolvedValue(attempt), markUnknown: vi.fn(), saveProviderResult: vi.fn().mockResolvedValue(attempt) } as ProviderAttemptRepository;
  const gateway = { createCheckout: vi.fn().mockResolvedValue({ providerPaymentId: "provider-payment", status: "pending", actions: [], expiresAt: null }) } as BillingGateway;
  const providerAllocation = { allocate: vi.fn().mockResolvedValue({ paymentMethodId: method.id, provider: "provider", environment: "test", providerReference: "ref", providerIdempotencyKey: "provider-key" }) };
  const gateways = { resolve: vi.fn().mockReturnValue(gateway) };
  const isPaymentMethodEnabled = vi.fn().mockReturnValue(true);
  return { pricingPlans, paymentCatalog, payments, attempts, gateway, providerAllocation, gateways, isPaymentMethodEnabled };
}

const checkoutInput = { userId: "user-1", pricingPlanId: "plan-1", paymentMethodCatalogId: "method-1", idempotencyKey: "key-1" };

describe("billing use cases", () => {
  it("snapshots pricing and creates checkout", async () => {
    const deps = dependencies();
    await createBillingCheckout(deps, checkoutInput);
    expect(deps.payments.createIdempotently).toHaveBeenCalledWith(expect.objectContaining({ priceAmount: 10000, baseCredits: 100, bonusCredits: 10 }));
    expect(deps.gateway.createCheckout).toHaveBeenCalledOnce();
  });

  it("rejects a feature-flagged payment method before creating a payment", async () => {
    const deps = dependencies();
    deps.isPaymentMethodEnabled.mockReturnValue(false);

    await expect(createBillingCheckout(deps, checkoutInput)).rejects.toBeInstanceOf(PaymentMethodUnavailableError);
    expect(deps.payments.createIdempotently).not.toHaveBeenCalled();
    expect(deps.attempts.allocate).not.toHaveBeenCalled();
  });

  it("prepares the checkout payment methods using the same eligibility policy", async () => {
    const deps = dependencies();
    vi.mocked(deps.paymentCatalog.listEnabled).mockResolvedValue([
      method,
      { ...method, id: "method-2", kind: "virtual_account", minAmount: 20000 },
    ]);

    await expect(prepareBillingCheckout({ paymentCatalog: deps.paymentCatalog, isPaymentMethodEnabled: deps.isPaymentMethodEnabled }, { plan, checkoutEnabled: true })).resolves.toEqual({
      methods: [
        expect.objectContaining({ id: "method-1", enabled: true }),
        expect.objectContaining({ id: "method-2", enabled: false }),
      ],
      checkoutAvailable: true,
      unavailableMessage: undefined,
    });
  });

  it("preserves the unavailable message when every payment method is disabled", async () => {
    const deps = dependencies();
    deps.isPaymentMethodEnabled.mockReturnValue(false);
    vi.mocked(deps.paymentCatalog.listEnabled).mockResolvedValue([method]);

    await expect(prepareBillingCheckout({ paymentCatalog: deps.paymentCatalog, isPaymentMethodEnabled: deps.isPaymentMethodEnabled }, { plan, checkoutEnabled: true })).resolves.toMatchObject({
      checkoutAvailable: false,
      unavailableMessage: "Checkout is temporarily unavailable. Your plan selection is still shown below.",
    });
  });

  it("returns an idempotent existing payment without another attempt", async () => {
    const deps = dependencies(false);
    await createBillingCheckout(deps, checkoutInput);
    expect(deps.attempts.allocate).not.toHaveBeenCalled();
  });

  it("rejects an idempotency replay when an immutable snapshot field differs", async () => {
    const deps = dependencies(false);
    vi.mocked(deps.payments.createIdempotently).mockResolvedValue({ payment: { ...payment, baseCredits: payment.baseCredits + 1 }, created: false });
    await expect(createBillingCheckout(deps, checkoutInput)).rejects.toBeInstanceOf(BillingIdempotencyConflictError);
    expect(deps.payments.findOwnedProjection).not.toHaveBeenCalled();
  });

  it("marks an attempt unknown when provider creation is indeterminate", async () => {
    const deps = dependencies();
    vi.mocked(deps.gateway.createCheckout).mockRejectedValue(new Error("timeout"));
    await expect(createBillingCheckout(deps, checkoutInput)).rejects.toMatchObject({ attemptId: "attempt-1", cause: expect.objectContaining({ message: "timeout" }) });
    expect(deps.attempts.markUnknown).toHaveBeenCalledWith("attempt-1");
  });

  it("marks an attempt unknown when saving the provider result fails", async () => {
    const deps = dependencies();
    const saveError = new Error("save failed");
    vi.mocked(deps.attempts.saveProviderResult).mockRejectedValue(saveError);

    await expect(createBillingCheckout(deps, checkoutInput)).rejects.toMatchObject({ attemptId: "attempt-1", cause: saveError });
    expect(deps.attempts.markUnknown).toHaveBeenCalledWith("attempt-1");
  });

  it("preserves the provider error when marking the attempt unknown also fails", async () => {
    const deps = dependencies();
    const providerError = new Error("timeout");
    vi.mocked(deps.gateway.createCheckout).mockRejectedValue(providerError);
    vi.mocked(deps.attempts.markUnknown).mockRejectedValue(new Error("mark unknown failed"));

    await expect(createBillingCheckout(deps, checkoutInput)).rejects.toMatchObject({ attemptId: "attempt-1", cause: providerError });
  });

  it("reloads owned payment state without provider side effects", async () => {
    const deps = dependencies();
    await expect(refreshOwnedBillingPayment({ payments: deps.payments }, { paymentId: payment.id, userId: payment.userId })).resolves.toEqual({ id: payment.id, status: "pending", actions: [], expiresAt: null });
    expect(deps.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it("returns the complete safe refresh projection", () => {
    expect(toBillingRefreshProjection({ ...projection, expiresAt: "payment-expiry", latestAttempt: { ...attempt, actions: [{ type: "qr_code", value: "qr-value", expiresAt: "action-expiry" }], expiresAt: "attempt-expiry" } })).toEqual({ id: payment.id, status: "pending", actions: [{ type: "qr_code", value: "qr-value", expiresAt: "action-expiry" }], expiresAt: "attempt-expiry" });
  });

  it("falls back to payment expiry when no attempt exists", () => {
    expect(toBillingRefreshProjection({ ...projection, expiresAt: "payment-expiry", latestAttempt: null })).toEqual({ id: payment.id, status: "pending", actions: [], expiresAt: "payment-expiry" });
  });

  it("durably receives and fulfills normalized webhooks before returning", async () => {
    const repository = { receive: vi.fn().mockResolvedValue({ eventId: "event-1", duplicate: false }), fulfill: vi.fn().mockResolvedValue("fulfilled") } as unknown as BillingWebhookRepository;
    const webhook = { provider: "provider", environment: "test" as const, deduplicationKey: "dedupe", eventType: "paid", status: "paid" as const, providerReference: "ref", providerPaymentId: "provider-payment", amount: 10000, currency: "IDR" as const, occurredAt: "now" };
    await expect(receiveBillingWebhook(repository, webhook)).resolves.toEqual({ eventId: "event-1", duplicate: false, outcome: "fulfilled", fulfilled: true });
    expect(repository.fulfill).toHaveBeenCalledWith("event-1");
  });

  it("returns terminal duplicate webhook receipts as fulfilled", async () => {
    const repository = { receive: vi.fn().mockResolvedValue({ eventId: "event-1", duplicate: true }), fulfill: vi.fn().mockResolvedValue("already_paid") } as unknown as BillingWebhookRepository;
    const webhook = { provider: "provider", environment: "test" as const, deduplicationKey: "dedupe", eventType: "paid", status: "paid" as const, providerReference: "ref", providerPaymentId: "provider-payment", amount: 10000, currency: "IDR" as const, occurredAt: "now" };
    await expect(receiveBillingWebhook(repository, webhook)).resolves.toEqual({ eventId: "event-1", duplicate: true, outcome: "already_paid", fulfilled: true });
    expect(repository.fulfill).toHaveBeenCalledWith("event-1");
  });

  it("marks unfulfilled webhook receipts retryable", async () => {
    const repository = { receive: vi.fn().mockResolvedValue({ eventId: "event-1", duplicate: true }), fulfill: vi.fn().mockResolvedValue("retryable") } as unknown as BillingWebhookRepository;
    const webhook = { provider: "provider", environment: "test" as const, deduplicationKey: "dedupe", eventType: "paid", status: "paid" as const, providerReference: "ref", providerPaymentId: "provider-payment", amount: 10000, currency: "IDR" as const, occurredAt: "now" };
    await expect(receiveBillingWebhook(repository, webhook)).resolves.toEqual({ eventId: "event-1", duplicate: true, outcome: "retryable", fulfilled: false });
  });
});
