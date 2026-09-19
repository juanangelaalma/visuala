import { describe, expect, it, vi } from "vitest";
import { BillingPaymentNotFoundError } from "@/domain/billing/errors";
import { getOwnedBillingPayment } from "./get-owned-billing-payment";
import { listEnabledPaymentMethods } from "./list-enabled-payment-methods";
import { recordBillingWebhookFailure } from "./record-billing-webhook-failure";

describe("getOwnedBillingPayment", () => {
  it("returns the owned projection", async () => {
    const projection = { id: "payment-1" };
    const repository = { findOwnedProjection: vi.fn().mockResolvedValue(projection) };

    await expect(getOwnedBillingPayment(repository as never, { paymentId: "payment-1", userId: "user-1" })).resolves.toBe(projection);
    expect(repository.findOwnedProjection).toHaveBeenCalledWith("payment-1", "user-1");
  });

  it("throws when the payment is missing or owned by another user", async () => {
    const repository = { findOwnedProjection: vi.fn().mockResolvedValue(null) };

    await expect(getOwnedBillingPayment(repository as never, { paymentId: "payment-1", userId: "user-1" })).rejects.toBeInstanceOf(BillingPaymentNotFoundError);
  });
});

describe("listEnabledPaymentMethods", () => {
  it("delegates to the payment catalog", async () => {
    const methods = [{ id: "method-1" }];
    const repository = { listEnabled: vi.fn().mockResolvedValue(methods) };

    await expect(listEnabledPaymentMethods(repository as never)).resolves.toBe(methods);
  });
});

describe("recordBillingWebhookFailure", () => {
  it("applies the default retry policy", async () => {
    const repository = { recordFailure: vi.fn().mockResolvedValue(true) };

    await expect(recordBillingWebhookFailure(repository as never, { eventId: "event-1", sanitizedError: "boom" })).resolves.toBe(true);
    expect(repository.recordFailure).toHaveBeenCalledWith("event-1", "boom", { maxAttempts: 8, baseDelaySeconds: 30, maxDelaySeconds: 3600 });
  });

  it("honors explicit retry policy overrides", async () => {
    const repository = { recordFailure: vi.fn().mockResolvedValue(false) };

    await recordBillingWebhookFailure(repository as never, { eventId: "event-1", sanitizedError: "boom", maxAttempts: 2, baseDelaySeconds: 5, maxDelaySeconds: 10 });

    expect(repository.recordFailure).toHaveBeenCalledWith("event-1", "boom", { maxAttempts: 2, baseDelaySeconds: 5, maxDelaySeconds: 10 });
  });
});
