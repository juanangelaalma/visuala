import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingWebhookRepository, ManualBillingReconciliationRepository } from "@/domain/billing/contracts";
import type { NormalizedWebhook, WebhookCandidate, WebhookFulfillmentOutcome, WebhookReceipt } from "@/domain/billing/types";
import type { Database } from "@/infrastructure/supabase/database.types";

export class SupabaseBillingWebhookRepository implements BillingWebhookRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async receive(webhook: NormalizedWebhook): Promise<WebhookReceipt> {
    const existing = await this.supabase.from("billing_webhook_events").select("id").eq("provider", webhook.provider).eq("environment", webhook.environment).eq("deduplication_key", webhook.deduplicationKey).maybeSingle();
    if (existing.error) throw existing.error;
    const { data, error } = await this.supabase.rpc("receive_billing_webhook", { p_provider: webhook.provider, p_environment: webhook.environment, p_deduplication_key: webhook.deduplicationKey, p_event_type: webhook.eventType, p_normalized_status: webhook.status, p_provider_reference: webhook.providerReference, p_provider_payment_id: webhook.providerPaymentId, p_amount: webhook.amount, p_currency: webhook.currency, p_occurred_at: webhook.occurredAt });
    if (error) throw error;
    return { eventId: data, duplicate: existing.data !== null };
  }

  async listCandidates(limit: number): Promise<WebhookCandidate[]> {
    const { data, error } = await this.supabase.from("billing_webhook_events").select("id").in("status", ["received", "failed"]).is("dead_lettered_at", null).or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`).order("received_at").limit(limit);
    if (error) throw error;
    return data.map(({ id }) => ({ eventId: id }));
  }

  async fulfill(eventId: string): Promise<WebhookFulfillmentOutcome> {
    const { data, error } = await this.supabase.rpc("fulfill_billing_webhook", { p_event_id: eventId, p_max_attempts: 8, p_verified_failed_settlement: false });
    if (error) throw error;
    if ((data as string) !== "not_eligible") return data;
    const event = await this.supabase.from("billing_webhook_events").select("status, outcome_code, dead_lettered_at").eq("id", eventId).single();
    if (event.error) throw event.error;
    return mapIneligibleWebhookEvent(event.data);
  }

  async recordFailure(eventId: string, sanitizedError: string, policy: { maxAttempts: number; baseDelaySeconds: number; maxDelaySeconds: number }): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("record_billing_webhook_failure", { p_event_id: eventId, p_error_sanitized: sanitizedError, p_max_attempts: policy.maxAttempts, p_base_delay_seconds: policy.baseDelaySeconds, p_max_delay_seconds: policy.maxDelaySeconds });
    if (error) throw error;
    return data;
  }
}

type IneligibleWebhookEvent = { status: string; outcome_code: string | null; dead_lettered_at: string | null };

export function mapIneligibleWebhookEvent(event: IneligibleWebhookEvent): WebhookFulfillmentOutcome {
  if ((event.status === "processed" || event.dead_lettered_at !== null) && event.outcome_code && event.outcome_code !== "not_eligible") return event.outcome_code as WebhookFulfillmentOutcome;
  return "retryable";
}

export class SupabaseManualBillingReconciliationRepository implements ManualBillingReconciliationRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async fulfillVerifiedFailedSettlement(eventId: string, authorization: { authorizedByUserId: string; reason: string }): Promise<WebhookFulfillmentOutcome> {
    if (!authorization.authorizedByUserId || !authorization.reason.trim()) throw new Error("manual_reconciliation_authorization_required");
    const { data, error } = await this.supabase.rpc("fulfill_billing_webhook", { p_event_id: eventId, p_max_attempts: 8, p_verified_failed_settlement: true });
    if (error) throw error;
    return data;
  }
}
