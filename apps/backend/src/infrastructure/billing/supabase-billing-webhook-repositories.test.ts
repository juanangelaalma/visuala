import { describe, expect, it, vi } from "vitest";
import type { NormalizedWebhook } from "@/domain/billing/types";
import { SupabaseBillingWebhookRepository, SupabaseManualBillingReconciliationRepository } from "./supabase-billing-webhook-repositories";

const webhook: NormalizedWebhook = {
  provider: "xendit",
  environment: "test",
  deduplicationKey: "dedupe",
  eventType: "payment.succeeded",
  status: "paid",
  providerReference: "reference",
  providerPaymentId: "provider-payment",
  amount: 10000,
  currency: "IDR",
  occurredAt: "2026-01-01T00:00:00.000Z",
};

function makeClient(options: { existingEvent?: unknown; eventRow?: unknown; candidates?: unknown; rpc?: (name: string) => unknown } = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in", "is", "or", "order", "limit"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(options.existingEvent ?? { data: null, error: null });
  chain.single = vi.fn().mockResolvedValue(options.eventRow ?? { data: null, error: null });
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(options.candidates ?? { data: [], error: null }).then(resolve));
  const rpc = vi.fn(async (name: string) => options.rpc?.(name) ?? { data: null, error: null });

  return { client: { from: vi.fn(() => chain), rpc }, chain, rpc };
}

describe("SupabaseBillingWebhookRepository", () => {
  it("receives a new webhook and reports it as not duplicated", async () => {
    const { client, rpc } = makeClient({ rpc: () => ({ data: "event-1", error: null }) });

    await expect(new SupabaseBillingWebhookRepository(client as never).receive(webhook)).resolves.toEqual({ eventId: "event-1", duplicate: false });

    expect(rpc).toHaveBeenCalledWith("receive_billing_webhook", {
      p_provider: "xendit",
      p_environment: "test",
      p_deduplication_key: "dedupe",
      p_event_type: "payment.succeeded",
      p_normalized_status: "paid",
      p_provider_reference: "reference",
      p_provider_payment_id: "provider-payment",
      p_amount: 10000,
      p_currency: "IDR",
      p_occurred_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("flags a webhook that was already stored", async () => {
    const { client } = makeClient({ existingEvent: { data: { id: "event-1" }, error: null }, rpc: () => ({ data: "event-1", error: null }) });

    await expect(new SupabaseBillingWebhookRepository(client as never).receive(webhook)).resolves.toEqual({ eventId: "event-1", duplicate: true });
  });

  it("propagates receive errors", async () => {
    const error = new Error("receive failed");
    const { client } = makeClient({ rpc: () => ({ data: null, error }) });

    await expect(new SupabaseBillingWebhookRepository(client as never).receive(webhook)).rejects.toBe(error);
  });

  it("fulfills directly when the RPC returns a terminal outcome", async () => {
    const { client, rpc } = makeClient({ rpc: () => ({ data: "fulfilled", error: null }) });

    await expect(new SupabaseBillingWebhookRepository(client as never).fulfill("event-1")).resolves.toBe("fulfilled");
    expect(rpc).toHaveBeenCalledWith("fulfill_billing_webhook", { p_event_id: "event-1", p_max_attempts: 8, p_verified_failed_settlement: false });
  });

  it("falls back to the stored event when the RPC reports not_eligible", async () => {
    const { client } = makeClient({
      rpc: () => ({ data: "not_eligible", error: null }),
      eventRow: { data: { status: "processed", outcome_code: "already_paid", dead_lettered_at: null }, error: null },
    });

    await expect(new SupabaseBillingWebhookRepository(client as never).fulfill("event-1")).resolves.toBe("already_paid");
  });

  it("treats an unprocessed not_eligible event as retryable", async () => {
    const { client } = makeClient({
      rpc: () => ({ data: "not_eligible", error: null }),
      eventRow: { data: { status: "failed", outcome_code: null, dead_lettered_at: null }, error: null },
    });

    await expect(new SupabaseBillingWebhookRepository(client as never).fulfill("event-1")).resolves.toBe("retryable");
  });

  it("rejects an invalid persisted outcome", async () => {
    const { client } = makeClient({ rpc: () => ({ data: "surprising", error: null }) });

    await expect(new SupabaseBillingWebhookRepository(client as never).fulfill("event-1")).rejects.toThrow("Invalid persisted webhook outcome");
  });

  it("records a failure with the supplied retry policy", async () => {
    const { client, rpc } = makeClient({ rpc: () => ({ data: true, error: null }) });

    await expect(new SupabaseBillingWebhookRepository(client as never).recordFailure("event-1", "boom", { maxAttempts: 3, baseDelaySeconds: 10, maxDelaySeconds: 60 })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_billing_webhook_failure", { p_event_id: "event-1", p_error_sanitized: "boom", p_max_attempts: 3, p_base_delay_seconds: 10, p_max_delay_seconds: 60 });
  });

  it("lists retry candidates", async () => {
    const { client } = makeClient({ candidates: { data: [{ id: "event-1" }, { id: "event-2" }], error: null } });

    await expect(new SupabaseBillingWebhookRepository(client as never).listCandidates(10)).resolves.toEqual([{ eventId: "event-1" }, { eventId: "event-2" }]);
  });

  it("propagates list errors", async () => {
    const error = new Error("list failed");
    const { client } = makeClient({ candidates: { data: null, error } });

    await expect(new SupabaseBillingWebhookRepository(client as never).listCandidates(10)).rejects.toBe(error);
  });
});

describe("SupabaseManualBillingReconciliationRepository", () => {
  it("requires an explicit authorization before settling", async () => {
    const { client } = makeClient();

    await expect(
      new SupabaseManualBillingReconciliationRepository(client as never).fulfillVerifiedFailedSettlement("event-1", { authorizedByUserId: "", reason: "because" }),
    ).rejects.toThrow("manual_reconciliation_authorization_required");

    await expect(
      new SupabaseManualBillingReconciliationRepository(client as never).fulfillVerifiedFailedSettlement("event-1", { authorizedByUserId: "admin-1", reason: "   " }),
    ).rejects.toThrow("manual_reconciliation_authorization_required");
  });

  it("settles a failed payment with the verified flag", async () => {
    const { client, rpc } = makeClient({ rpc: () => ({ data: "fulfilled", error: null }) });

    await expect(
      new SupabaseManualBillingReconciliationRepository(client as never).fulfillVerifiedFailedSettlement("event-1", { authorizedByUserId: "admin-1", reason: "bank confirmed" }),
    ).resolves.toBe("fulfilled");

    expect(rpc).toHaveBeenCalledWith("fulfill_billing_webhook", { p_event_id: "event-1", p_max_attempts: 8, p_verified_failed_settlement: true });
  });
});
