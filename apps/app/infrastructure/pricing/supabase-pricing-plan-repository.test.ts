import { describe, expect, it, vi } from "vitest";
import type { SavePricingPlanInput } from "@/domain/pricing/pricing-plan-repository";
import { SupabasePricingPlanRepository } from "./supabase-pricing-plan-repository";

const row = {
  id: "plan-1", slug: "pro", name: "Pro", price_amount: 100, currency: "USD", billing_period: "monthly", billing_label: "Monthly",
  compare_at_amount: 120, badge_label: "Best", cta_label: "Buy", credits: 10, bonus_credits: 2, credit_expires_in_days: 30,
  features: ["Feature"], is_active: true, is_most_popular: true, sort_order: 1, created_at: "created", updated_at: "updated",
};
const input: SavePricingPlanInput = {
  slug: "pro", name: "Pro", priceAmount: 100, currency: "USD", billingPeriod: "monthly", billingLabel: "Monthly",
  compareAtAmount: 120, badgeLabel: "Best", ctaLabel: "Buy", credits: 10, bonusCredits: 2, creditExpiresInDays: 30,
  features: ["Feature"], isActive: true, isMostPopular: true, sortOrder: 1,
};

function query(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "insert", "update", "delete"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve) => Promise.resolve(result).then(resolve));
  return chain;
}

function makeRepository(result: unknown) {
  const chain = query(result);
  const client = { from: vi.fn(() => chain) };
  return { repository: new SupabasePricingPlanRepository(client as never), chain };
}

describe("SupabasePricingPlanRepository", () => {
  it("maps active plan row to domain model", async () => {
    const { repository } = makeRepository({ data: row, error: null });

    const result = await repository.findActiveById("plan-1");

    expect(result).toEqual({ id: "plan-1", ...input, createdAt: "created", updatedAt: "updated" });
  });

  it("returns null when active plan does not exist", async () => {
    const { repository } = makeRepository({ data: null, error: null });

    const result = await repository.findActiveById("missing");

    expect(result).toBeNull();
  });

  it.each(["findActiveById", "listActive", "listAll", "create", "update", "delete"] as const)("propagates %s database errors", async (method) => {
    const error = new Error("database failed");
    const { repository } = makeRepository({ data: [], error });
    const args = method === "findActiveById" || method === "delete" ? ["plan-1"] : method === "update" ? ["plan-1", input] : method === "create" ? [input] : [];

    const result = (repository[method] as (...values: unknown[]) => Promise<unknown>)(...args);

    await expect(result).rejects.toBe(error);
  });

  it.each(["listActive", "listAll"] as const)("maps plans from %s", async (method) => {
    const { repository } = makeRepository({ data: [row], error: null });

    const result = await repository[method]();

    expect(result[0]?.priceAmount).toBe(100);
  });

  it.each(["create", "update"] as const)("maps %s input and result", async (method) => {
    const { repository, chain } = makeRepository({ data: row, error: null });

    const result = method === "create" ? await repository.create(input) : await repository.update("plan-1", input);

    expect({ result: result.slug, payload: method === "create" ? chain.insert.mock.calls[0]?.[0] : chain.update.mock.calls[0]?.[0] }).toEqual({
      result: "pro",
      payload: { slug: "pro", name: "Pro", price_amount: 100, currency: "USD", billing_period: "monthly", billing_label: "Monthly", compare_at_amount: 120, badge_label: "Best", cta_label: "Buy", credits: 10, bonus_credits: 2, credit_expires_in_days: 30, features: ["Feature"], is_active: true, is_most_popular: true, sort_order: 1 },
    });
  });

  it("deletes plan by id", async () => {
    const { repository, chain } = makeRepository({ error: null });

    await repository.delete("plan-1");

    expect(chain.eq).toHaveBeenCalledWith("id", "plan-1");
  });
});
