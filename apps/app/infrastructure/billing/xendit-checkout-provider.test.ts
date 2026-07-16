import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { BillingConfig } from "@/shared/config/billing";
import { XenditAmbiguousOutcomeError, XenditCheckoutProvider, XenditWebhookVerificationError } from "./xendit-checkout-provider";

const config: BillingConfig = { checkoutEnabled: true, qrisEnabled: true, environment: "test", apiKey: "xnd_development_test", webhookToken: "callback-test", requestTimeoutMs: 1000 };
const payment = { id: "payment", userId: "user", pricingPlanId: "plan", selectedPaymentMethodId: "method", idempotencyKey: "key", status: "pending" as const, priceAmount: 10000, currency: "IDR" as const, baseCredits: 10, bonusCredits: 0, creditExpiresInDays: 30, expiresAt: null, paidAt: null, settlementAuditCode: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const attempt = { id: "attempt", billingPaymentId: "payment", paymentMethodId: "method", provider: "xendit", environment: "test" as const, providerReference: "visuala-reference", providerIdempotencyKey: "unused", providerPaymentId: null, status: "creating" as const, actions: [], expiresAt: null };
const method = { id: "method", slug: "qris", kind: "qris" as const, label: "QRIS", description: null, logoUrl: null, currency: "IDR" as const, minAmount: null, maxAmount: null, enabled: true, launchPhase: 1, sortOrder: 1 };

describe("XenditCheckoutProvider docs-derived fixtures (not sandbox-certified)", () => {
  it("creates QRIS without an idempotency header and normalizes QR text", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_request_id: "pr-1", reference_id: "visuala-reference", status: "REQUIRES_ACTION", actions: [{ type: "PRESENT_TO_CUSTOMER", descriptor: "QR_STRING", value: "000201010212" }] }), { status: 200 }));
    const result = await new XenditCheckoutProvider(config, fetcher).createCheckout(attempt, payment, method);
    expect(result).toMatchObject({ providerPaymentId: "pr-1", status: "requires_action", actions: [{ type: "qr_code", value: "000201010212" }] });
    const [, init] = fetcher.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    expect(JSON.parse(init.body)).toMatchObject({ type: "PAY", country: "ID", currency: "IDR", capture_method: "AUTOMATIC", channel_code: "QRIS", channel_properties: {} });
  });

  it("retrieves only by the known provider ID", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_request_id: "pr-1", reference_id: "visuala-reference", status: "PENDING", actions: [] }), { status: 200 }));
    await new XenditCheckoutProvider(config, fetcher).retrievePayment("pr-1");
    expect(fetcher).toHaveBeenCalledWith("https://api.xendit.co/v3/payment_requests/pr-1", expect.objectContaining({ method: "GET" }));
  });

  it("keeps an ambiguous create unknown for manual review without retrying", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("socket"));
    const provider = new XenditCheckoutProvider(config, fetcher);
    await expect(provider.createCheckout(attempt, payment, method)).rejects.toBeInstanceOf(XenditAmbiguousOutcomeError);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed when checkout is disabled", async () => {
    const provider = new XenditCheckoutProvider({ ...config, checkoutEnabled: false }, vi.fn());
    await expect(provider.createCheckout(attempt, payment, method)).rejects.toMatchObject({ category: "configuration" });
  });

  it("verifies and normalizes the nested v3 payment.capture envelope", () => {
    const provider = new XenditCheckoutProvider(config, vi.fn());
    const payload = {
      event: "payment.capture",
      created: "2026-01-01T00:00:00.000Z",
      api_version: "2024-11-11",
      data: {
        payment_id: "py-1",
        payment_request_id: "pr-1",
        reference_id: "visuala-reference",
        status: "SUCCEEDED",
        request_amount: 10000,
        currency: "IDR",
        channel_code: "QRIS",
        updated: "2026-01-01T00:00:01.000Z",
        captures: [{ capture_id: "capture-1" }],
      },
    };
    const first = provider.verifyAndNormalizeWebhook("callback-test", payload);

    expect(first).toMatchObject({ eventType: "payment.capture", status: "paid", providerPaymentId: "pr-1", providerReference: "visuala-reference", amount: 10000, currency: "IDR", occurredAt: "2026-01-01T00:00:01.000Z" });
    expect(first.providerPaymentId).not.toBe(payload.data.payment_id);
    expect(provider.verifyAndNormalizeWebhook("callback-test", payload).deduplicationKey).toBe(first.deduplicationKey);
    expect(provider.verifyAndNormalizeWebhook("callback-test", { ...payload, data: { ...payload.data, captures: [{ capture_id: "capture-2" }], provider_response: { detail: "changed" } } }).deduplicationKey).toBe(first.deduplicationKey);
    expect(provider.verifyAndNormalizeWebhook("callback-test", { ...payload, data: { ...payload.data, payment_id: "py-2" } }).deduplicationKey).not.toBe(first.deduplicationKey);
  });

  it("falls back to the v3 root creation timestamp", () => {
    const provider = new XenditCheckoutProvider(config, vi.fn());
    const payload = { event: "payment.capture", created: "2026-01-01T00:00:00.000Z", api_version: "2024-11-11", data: { payment_id: "py-1", payment_request_id: "pr-1", reference_id: "visuala-reference", status: "SUCCEEDED", request_amount: 10000, currency: "IDR", channel_code: "QRIS" } };

    expect(provider.verifyAndNormalizeWebhook("callback-test", payload).occurredAt).toBe(payload.created);
  });

  it("verifies callback tokens independently with constant-time comparison", () => {
    const provider = new XenditCheckoutProvider(config, vi.fn());

    expect(() => provider.verifyWebhookToken("callback-test")).not.toThrow();
    expect(() => provider.verifyWebhookToken("wrong")).toThrow(XenditWebhookVerificationError);
    expect(() => provider.verifyWebhookToken(null)).toThrow(XenditWebhookVerificationError);
  });

  it("rejects malformed v3 required fields and verifies the token before parsing", () => {
    const provider = new XenditCheckoutProvider(config, vi.fn());
    const malformed = { event: "payment.capture", created: "2026-01-01T00:00:00.000Z", api_version: "2024-11-11", data: { payment_id: "py-1", reference_id: "visuala-reference", status: "SUCCEEDED", request_amount: 10000, currency: "IDR", channel_code: "QRIS" } };

    expect(() => provider.verifyAndNormalizeWebhook("callback-test", malformed)).toThrow(XenditWebhookVerificationError);
    expect(() => provider.verifyAndNormalizeWebhook("wrong", malformed)).toThrow(XenditWebhookVerificationError);
  });

  it("keeps legacy flat callback compatibility", () => {
    const provider = new XenditCheckoutProvider(config, vi.fn());
    const payload = { event: "payment.changed", payment_id: "py-1", payment_request_id: "pr-1", reference_id: "visuala-reference", status: "NEW_STATUS", request_amount: 10000, currency: "IDR", channel_code: "QRIS", updated: "2026-01-01T00:00:00.000Z" };

    expect(provider.verifyAndNormalizeWebhook("callback-test", payload)).toMatchObject({ eventType: "payment.changed", status: "requires_review", providerPaymentId: "pr-1" });
    expect(provider.verifyAndNormalizeWebhook("callback-test", { ...payload, event: "refund.succeeded", status: "SUCCEEDED" }).status).toBe("ignored");
  });
});
