import { describe, expect, it, vi } from "vitest";
import { SupabaseCreditRepository } from "./supabase-credit-repository";

function makeRepository(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve) => Promise.resolve(result).then(resolve));
  return new SupabaseCreditRepository({ from: vi.fn(() => chain) } as never);
}

describe("SupabaseCreditRepository", () => {
  it("maps owned wallet", async () => {
    const repository = makeRepository({ data: { user_id: "user-1", balance: 12, created_at: "created", updated_at: "updated" }, error: null });
    expect(await repository.findWalletByOwner("user-1")).toEqual({ userId: "user-1", balance: 12, createdAt: "created", updatedAt: "updated" });
  });

  it("returns null for missing wallet", async () => {
    const repository = makeRepository({ data: null, error: null });
    expect(await repository.findWalletByOwner("user-1")).toBeNull();
  });

  it.each(["wallet", "grants", "ledger"])("propagates %s query errors", async (kind) => {
    const error = new Error("database failed");
    const repository = makeRepository({ data: [], error });
    const result = kind === "wallet" ? repository.findWalletByOwner("user-1") : kind === "grants" ? repository.listOwnedGrants("user-1") : repository.listOwnedLedgerEntries("user-1");
    await expect(result).rejects.toBe(error);
  });

  it("maps owned grants", async () => {
    const data = [{ id: "grant-1", user_id: "user-1", billing_payment_id: "payment-1", pricing_plan_id: "plan-1", amount: 10, remaining_amount: 8, granted_at: "granted", expires_at: "expires" }];
    const repository = makeRepository({ data, error: null });
    expect(await repository.listOwnedGrants("user-1")).toEqual([{ id: "grant-1", userId: "user-1", billingPaymentId: "payment-1", pricingPlanId: "plan-1", amount: 10, remainingAmount: 8, grantedAt: "granted", expiresAt: "expires" }]);
  });

  it("maps owned ledger entries", async () => {
    const data = [{ id: "entry-1", user_id: "user-1", billing_payment_id: "payment-1", credit_grant_id: "grant-1", entry_type: "grant", amount: 10, balance_after: 10, idempotency_key: "key", created_at: "created" }];
    const repository = makeRepository({ data, error: null });
    expect(await repository.listOwnedLedgerEntries("user-1")).toEqual([{ id: "entry-1", userId: "user-1", billingPaymentId: "payment-1", creditGrantId: "grant-1", entryType: "grant", amount: 10, balanceAfter: 10, idempotencyKey: "key", createdAt: "created" }]);
  });
});
