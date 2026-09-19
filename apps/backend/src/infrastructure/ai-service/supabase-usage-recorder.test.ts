import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sanitizedDiagnostic } from "../../domain/ai-service/errors";
import { SupabaseUsageRecorder } from "./supabase-usage-recorder";

const migrationPath = resolve(
  process.cwd(),
  "../backend/supabase/migrations/20260912001000_create_ai_service_usage.sql",
);

describe("SupabaseUsageRecorder", () => {
  it("persists operation start before later paid work", async () => {
    const { recorder, client } = makeRecorder();
    await recorder.startOperation({
      requestId: "4e0921e1-858d-4f55-a534-8589868b1f9c",
      task: "planner",
      userId: "user-1",
      projectId: undefined,
      promptVersion: "planner-v2",
      schemaName: undefined,
      schemaVersion: undefined,
      profileId: "primary",
      provider: "google",
      model: "gemini-2.5-flash",
    });
    expect(client.calls).toEqual([{
      table: "ai_service_operations",
      operation: "insert",
      value: {
        request_id: "4e0921e1-858d-4f55-a534-8589868b1f9c",
        task: "planner",
        user_id: "user-1",
        project_id: null,
        prompt_version: "planner-v2",
        schema_name: null,
        schema_version: null,
        profile_id: "primary",
        provider: "google",
        model: "gemini-2.5-flash",
        status: "started",
      },
    }]);
  });

  it("clears cost metadata when an operation cost is incomplete", async () => {
    const { recorder, client } = makeRecorder();
    await recorder.finalizeOperation("request-1", {
      latencyMs: 121,
      attemptCount: 2,
      finishReason: null,
      usage: { inputTokens: null, outputTokens: 0, totalTokens: null },
      estimatedCost: {
        amount: 0.1234567894,
        currency: "USD",
        pricingVersion: "2026-09",
        source: "provider-price-list",
      },
      costComplete: false,
      errorCode: "AI_TIMEOUT",
    });
    expect(client.calls[0]).toEqual({
      table: "ai_service_operations",
      operation: "update",
      value: expect.objectContaining({
        status: "failed",
        latency_ms: 121,
        attempt_count: 2,
        input_tokens: null,
        output_tokens: 0,
        total_tokens: null,
        estimated_cost: null,
        cost_currency: null,
        pricing_version: null,
        pricing_source: null,
        cost_complete: false,
        error_code: "AI_TIMEOUT",
        updated_at: expect.any(String),
      }),
      filters: [["request_id", "request-1"]],
    });
  });

  it("persists attempt start with request and attempt identity", async () => {
    const { recorder, client } = makeRecorder();
    await recorder.startAttempt({
      requestId: "request-1",
      attemptId: "attempt-1",
      attemptNumber: 2,
      profileId: "primary",
      provider: "google",
      model: "gemini-2.5-flash",
    });
    expect(client.calls[0]).toEqual({
      table: "ai_service_attempts",
      operation: "insert",
      value: {
        attempt_id: "attempt-1",
        request_id: "request-1",
        attempt_number: 2,
        profile_id: "primary",
        provider: "google",
        model: "gemini-2.5-flash",
        status: "started",
      },
    });
  });

  it("finalizes attempts with null dimensions and unknown billing preserved", async () => {
    const { recorder, client } = makeRecorder();
    await recorder.finalizeAttempt("attempt-1", {
      providerRequestId: null,
      latencyMs: 80,
      usage: { inputTokens: null, outputTokens: 0, totalTokens: null },
      errorCode: null,
      dispatchOutcome: "ambiguous",
      usageUnknown: true,
      billingUnknown: true,
      estimatedCost: null,
      costComplete: false,
    });
    expect(client.calls[0]).toEqual({
      table: "ai_service_attempts",
      operation: "update",
      value: expect.objectContaining({
        status: "succeeded",
        provider_request_id: null,
        input_tokens: null,
        output_tokens: 0,
        total_tokens: null,
        billing_unknown: true,
        usage_unknown: true,
        dispatch_outcome: "ambiguous",
        estimated_cost: null,
        cost_currency: null,
        pricing_version: null,
        pricing_source: null,
        cost_complete: false,
      }),
      filters: [["attempt_id", "attempt-1"]],
    });
  });

  it("persists bounded diagnostics as valid JSON", async () => {
    const { recorder, client } = makeRecorder();
    const diagnostic = sanitizedDiagnostic("x".repeat(2_000));
    await recorder.recordDiagnostic(
      "request-1",
      diagnostic,
      "AI_UNAVAILABLE",
    );
    const call = client.calls[0] as { value: { diagnostic_sanitized: string } };
    const persistedDiagnostic = JSON.parse(call.value.diagnostic_sanitized);
    expect(persistedDiagnostic).toMatchObject({ fields: {} });
    expect(persistedDiagnostic.event).toMatch(/^x+$/);
    expect(call.value.diagnostic_sanitized).toHaveLength(1_000);
    expect(client.calls[0]).toEqual({
      table: "ai_service_operations",
      operation: "update",
      value: {
        diagnostic_sanitized: call.value.diagnostic_sanitized,
        error_code: "AI_UNAVAILABLE",
      },
      filters: [["request_id", "request-1"]],
    });
  });
});

describe("AI service usage migration", () => {
  it("creates isolated operation and attempt tables without content columns", () => {
    const sql = migrationSql();
    expect(sql).toContain("create table public.ai_service_operations");
    expect(sql).toContain("create table public.ai_service_attempts");
    expect(sql).not.toMatch(/references public\.(ai_generations|ai_projects|ai_scenes|ai_assets|credit_)/i);
    expect(sql).not.toMatch(/\b(prompt|response|schema_body|image|secret|api_key)\b/i);
  });

  it("enforces request and attempt uniqueness", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/request_id uuid primary key/i);
    expect(sql).toMatch(/unique \(request_id, attempt_number\)/i);
  });

  it("enforces complete nonnegative cost metadata or no cost metadata", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/estimated_cost is null or estimated_cost >= 0/i);
    expect(sql).toMatch(/cost_complete[\s\S]*estimated_cost is not null[\s\S]*cost_currency is not null[\s\S]*pricing_version is not null[\s\S]*pricing_source is not null/i);
    expect(sql).toMatch(/not cost_complete[\s\S]*estimated_cost is null[\s\S]*cost_currency is null[\s\S]*pricing_version is null[\s\S]*pricing_source is null/i);
  });

  it("stores operation snapshots and complete attempt lifecycle metadata", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.ai_service_operations[\s\S]*profile_id text not null[\s\S]*provider text not null[\s\S]*model text not null/i);
    expect(sql).toMatch(/create table public\.ai_service_attempts[\s\S]*dispatch_outcome text[\s\S]*usage_unknown boolean[\s\S]*billing_unknown boolean[\s\S]*estimated_cost numeric[\s\S]*cost_complete boolean/i);
    expect(sql).toMatch(/dispatch_outcome in \('not_sent', 'rejected', 'ambiguous'\)/i);
  });

  it("updates operation timestamps automatically", () => {
    expect(migrationSql()).toMatch(/before update on public\.ai_service_operations[\s\S]*set_ai_service_updated_at/i);
  });

  it("types the attempt to operation relationship", () => {
    const types = databaseTypes();
    const operations = types.slice(
      types.indexOf("ai_service_operations:"),
      types.indexOf("ai_service_attempts:"),
    );
    const attempts = types.slice(
      types.indexOf("ai_service_attempts:"),
      types.indexOf("profiles:"),
    );
    expect(operations).toContain("Relationships: []");
    expect(attempts).toContain('foreignKeyName: "ai_service_attempts_request_id_fkey"');
    expect(attempts).toContain('referencedRelation: "ai_service_operations"');
  });

  it("enables RLS, revokes browser roles, and grants service role", () => {
    const sql = migrationSql();
    for (const table of ["ai_service_operations", "ai_service_attempts"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
      expect(sql).toContain(`grant select, insert, update, delete on table public.${table} to service_role`);
    }
  });

  it("indexes request, task, user, status, and timestamp access paths", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/ai_service_operations_user_id_created_at_idx[\s\S]*\(user_id, created_at\)/i);
    expect(sql).toMatch(/ai_service_operations_task_status_created_at_idx[\s\S]*\(task, status, created_at\)/i);
    expect(sql).toMatch(/ai_service_attempts_request_id_created_at_idx[\s\S]*\(request_id, created_at\)/i);
    expect(sql).toMatch(/ai_service_attempts_status_created_at_idx[\s\S]*\(status, created_at\)/i);
  });
});

function makeRecorder() {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    calls,
    from(table: string) {
      return {
        insert: vi.fn(async (value: unknown) => {
          calls.push({ table, operation: "insert", value });
          return { error: null };
        }),
        update: vi.fn((value: unknown) => {
          const filters: unknown[] = [];
          const chain = {
            eq: vi.fn(async (column: string, filterValue: unknown) => {
              filters.push([column, filterValue]);
              calls.push({ table, operation: "update", value, filters });
              return { error: null };
            }),
          };
          return chain;
        }),
      };
    },
  };
  return { recorder: new SupabaseUsageRecorder(client as never), client };
}

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8");
}

function databaseTypes(): string {
  return readFileSync(resolve(process.cwd(), "../../packages/db/src/database.types.ts"), "utf8");
}
