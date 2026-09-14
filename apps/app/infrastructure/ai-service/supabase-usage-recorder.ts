import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageRecorder } from "../../domain/ai-service/contracts";
import type { AIErrorCode, SanitizedDiagnostic } from "../../domain/ai-service/errors";
import type {
  AIAttemptOutcome,
  AIAttemptRecord,
  AIOperationOutcome,
  AIOperationRecord,
} from "../../domain/ai-service/types";
import type { Database } from "../supabase/database.types";

const MAX_DIAGNOSTIC_LENGTH = 1_000;
const COST_DECIMAL_PLACES = 9;

export class SupabaseUsageRecorder implements UsageRecorder {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async startOperation(record: AIOperationRecord): Promise<void> {
    const { error } = await this.supabase.from("ai_service_operations").insert({
      request_id: record.requestId,
      task: record.task,
      user_id: record.userId,
      project_id: record.projectId ?? null,
      prompt_version: record.promptVersion,
      schema_name: record.schemaName ?? null,
      schema_version: record.schemaVersion ?? null,
      profile_id: record.profileId,
      provider: record.provider,
      model: record.model,
      status: "started",
    });
    if (error) throw error;
  }

  async finalizeOperation(requestId: string, outcome: AIOperationOutcome): Promise<void> {
    const cost = normalizeOperationCost(outcome);
    const { error } = await this.supabase.from("ai_service_operations").update({
      status: outcome.errorCode ? "failed" : "succeeded",
      latency_ms: outcome.latencyMs,
      attempt_count: outcome.attemptCount,
      finish_reason: outcome.finishReason,
      input_tokens: outcome.usage.inputTokens,
      output_tokens: outcome.usage.outputTokens,
      total_tokens: outcome.usage.totalTokens,
      estimated_cost: cost ? roundCost(cost.amount) : null,
      cost_currency: cost?.currency ?? null,
      pricing_version: cost?.pricingVersion ?? null,
      pricing_source: cost?.source ?? null,
      cost_complete: outcome.costComplete,
      error_code: outcome.errorCode,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("request_id", requestId);
    if (error) throw error;
  }

  async startAttempt(record: AIAttemptRecord): Promise<void> {
    const { error } = await this.supabase.from("ai_service_attempts").insert({
      attempt_id: record.attemptId,
      request_id: record.requestId,
      attempt_number: record.attemptNumber,
      profile_id: record.profileId,
      provider: record.provider,
      model: record.model,
      status: "started",
    });
    if (error) throw error;
  }

  async finalizeAttempt(attemptId: string, outcome: AIAttemptOutcome): Promise<void> {
    const cost = outcome.costComplete ? outcome.estimatedCost : null;
    const { error } = await this.supabase.from("ai_service_attempts").update({
      status: outcome.errorCode ? "failed" : "succeeded",
      provider_request_id: outcome.providerRequestId,
      latency_ms: outcome.latencyMs,
      input_tokens: outcome.usage.inputTokens,
      output_tokens: outcome.usage.outputTokens,
      total_tokens: outcome.usage.totalTokens,
      dispatch_outcome: outcome.dispatchOutcome,
      usage_unknown: outcome.usageUnknown,
      billing_unknown: outcome.billingUnknown,
      estimated_cost: cost ? roundCost(cost.amount) : null,
      cost_currency: cost?.currency ?? null,
      pricing_version: cost?.pricingVersion ?? null,
      pricing_source: cost?.source ?? null,
      cost_complete: outcome.costComplete,
      error_code: outcome.errorCode,
      completed_at: new Date().toISOString(),
    }).eq("attempt_id", attemptId);
    if (error) throw error;
  }

  async recordDiagnostic(
    requestId: string,
    diagnostic: SanitizedDiagnostic,
    errorCode?: AIErrorCode,
  ): Promise<void> {
    const serialized = serializeBoundedDiagnostic(diagnostic);
    const { error } = await this.supabase.from("ai_service_operations").update({
      diagnostic_sanitized: serialized,
      error_code: errorCode ?? null,
    }).eq("request_id", requestId);
    if (error) throw error;
  }
}

function normalizeOperationCost(outcome: AIOperationOutcome) {
  return outcome.costComplete ? outcome.estimatedCost : null;
}

function roundCost(amount: number): number {
  return Number(amount.toFixed(COST_DECIMAL_PLACES));
}

function serializeBoundedDiagnostic(diagnostic: SanitizedDiagnostic): string {
  const serialized = JSON.stringify(diagnostic);
  if (serialized.length <= MAX_DIAGNOSTIC_LENGTH) return serialized;
  const fields = diagnostic.fields;
  const overhead = JSON.stringify({ event: "", fields }).length;
  return JSON.stringify({
    event: diagnostic.event.slice(0, MAX_DIAGNOSTIC_LENGTH - overhead),
    fields,
  });
}
