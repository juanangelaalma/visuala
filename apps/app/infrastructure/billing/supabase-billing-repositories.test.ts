import { describe, expect, it } from "vitest";
import { mapIneligibleWebhookEvent } from "./supabase-billing-webhook-repositories";
import { mapAttempt, mapPayment, mapPaymentMethod } from "./supabase-billing-repositories";

describe("billing Supabase mappings", () => {
  it("maps database rows to domain models", () => {
    expect(mapPaymentMethod({ id: "method", slug: "qris", kind: "qris", label: "QRIS", description: null, logo_url: "/qris.svg", currency: "IDR", min_amount: null, max_amount: 100, enabled: true, launch_phase: 1, sort_order: 2, created_at: "created", updated_at: "updated" })).toMatchObject({ logoUrl: "/qris.svg", maxAmount: 100, launchPhase: 1, sortOrder: 2 });
    expect(mapPayment({ id: "payment", user_id: "user", pricing_plan_id: "plan", selected_payment_method_id: "method", idempotency_key: "key", status: "pending", price_amount: 10, currency: "IDR", base_credits: 8, bonus_credits: 2, credit_expires_in_days: 30, expires_at: null, paid_at: null, settlement_audit_code: null, created_at: "created", updated_at: "updated" })).toMatchObject({ userId: "user", pricingPlanId: "plan", priceAmount: 10, baseCredits: 8 });
    expect(mapAttempt({ id: "attempt", billing_payment_id: "payment", payment_method_id: "method", provider_mapping_id: "mapping", attempt_number: 1, provider: "xendit", environment: "test", mapping_version: 1, provider_method_type: "QR_CODE", provider_channel_code: "QRIS", mapping_config: {}, provider_reference: "reference", provider_idempotency_key: "key", provider_payment_id: null, status: "creating", actions: [], raw_provider_status: null, failure_category: null, expires_at: null, last_reconciled_at: null, completed_at: null, created_at: "created", updated_at: "updated" })).toMatchObject({ billingPaymentId: "payment", providerReference: "reference", actions: [] });
  });

  it("distinguishes terminal ineligible events from retryable events", () => {
    expect(mapIneligibleWebhookEvent({ status: "processed", outcome_code: "fulfilled", dead_lettered_at: null })).toBe("fulfilled");
    expect(mapIneligibleWebhookEvent({ status: "failed", outcome_code: "quarantined_requires_review", dead_lettered_at: "now" })).toBe("quarantined_requires_review");
    expect(mapIneligibleWebhookEvent({ status: "failed", outcome_code: null, dead_lettered_at: null })).toBe("retryable");
    expect(mapIneligibleWebhookEvent({ status: "failed", outcome_code: null, dead_lettered_at: "now" })).toBe("retryable");
  });
});
