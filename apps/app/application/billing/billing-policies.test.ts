import { describe, expect, it, vi } from "vitest";
import { BillingPaymentNotFoundError } from "@/domain/billing/errors";
import { getOwnedBillingPayment } from "./get-owned-billing-payment";
import { listEnabledPaymentMethods } from "./list-enabled-payment-methods";
import { createPaymentMethodFeaturePolicy } from "./payment-method-feature-policy";
import { recordBillingWebhookFailure } from "./record-billing-webhook-failure";

describe("billing policies", () => {
  it("returns owned payment", async () => {
    const payment = { id: "payment-1" };
    const repository = { findOwnedProjection: vi.fn().mockResolvedValue(payment) };
    expect(await getOwnedBillingPayment(repository as never, { paymentId: "payment-1", userId: "user-1" })).toBe(payment);
  });

  it("rejects missing owned payment", async () => {
    const repository = { findOwnedProjection: vi.fn().mockResolvedValue(null) };
    await expect(getOwnedBillingPayment(repository as never, { paymentId: "payment-1", userId: "user-1" })).rejects.toBeInstanceOf(BillingPaymentNotFoundError);
  });

  it("lists enabled methods", async () => {
    const methods = [{ id: "method-1" }];
    const repository = { listEnabled: vi.fn().mockResolvedValue(methods) };
    expect(await listEnabledPaymentMethods(repository as never)).toBe(methods);
  });

  it.each([["qris", true], ["virtual_account", false], ["card", false]])("applies %s feature policy", (kind, enabled) => {
    const policy = createPaymentMethodFeaturePolicy({ qrisEnabled: true, virtualAccountEnabled: false } as never);
    expect(policy({ kind } as never)).toBe(enabled);
  });

  it("records failure with default retry policy", async () => {
    const repository = { recordFailure: vi.fn().mockResolvedValue("recorded") };
    const result = await recordBillingWebhookFailure(repository as never, { eventId: "event-1", sanitizedError: "failed" });
    expect({ result, call: repository.recordFailure.mock.calls[0] }).toEqual({ result: "recorded", call: ["event-1", "failed", { maxAttempts: 8, baseDelaySeconds: 30, maxDelaySeconds: 3600 }] });
  });

  it("records failure with custom retry policy", async () => {
    const repository = { recordFailure: vi.fn().mockResolvedValue(undefined) };
    await recordBillingWebhookFailure(repository as never, { eventId: "event-1", sanitizedError: "failed", maxAttempts: 2, baseDelaySeconds: 4, maxDelaySeconds: 8 });
    expect(repository.recordFailure).toHaveBeenCalledWith("event-1", "failed", { maxAttempts: 2, baseDelaySeconds: 4, maxDelaySeconds: 8 });
  });
});
