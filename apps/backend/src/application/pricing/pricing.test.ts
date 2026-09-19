import { describe, expect, it, vi } from "vitest";
import { createPricingPlan } from "./create-pricing-plan";
import { deletePricingPlan } from "./delete-pricing-plan";
import { listActivePricingPlans } from "./list-active-pricing-plans";
import { listPricingPlans } from "./list-pricing-plans";
import { updatePricingPlan } from "./update-pricing-plan";

const plan = { id: "plan-1" };
const input = { slug: "pro" };

describe("pricing use cases", () => {
  it("creates plan through repository", async () => {
    const repository = { create: vi.fn().mockResolvedValue(plan) };
    expect(await createPricingPlan(repository as never, input as never)).toBe(plan);
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it("updates plan through repository", async () => {
    const repository = { update: vi.fn().mockResolvedValue(plan) };
    expect(await updatePricingPlan(repository as never, "plan-1", input as never)).toBe(plan);
    expect(repository.update).toHaveBeenCalledWith("plan-1", input);
  });

  it("lists all plans through repository", async () => {
    const repository = { listAll: vi.fn().mockResolvedValue([plan]) };
    expect(await listPricingPlans(repository as never)).toEqual([plan]);
  });

  it("lists active plans through repository", async () => {
    const repository = { listActive: vi.fn().mockResolvedValue([plan]) };
    expect(await listActivePricingPlans(repository as never)).toEqual([plan]);
  });

  it("deletes plan through repository", async () => {
    const repository = { delete: vi.fn().mockResolvedValue(undefined) };
    await deletePricingPlan(repository as never, "plan-1");
    expect(repository.delete).toHaveBeenCalledWith("plan-1");
  });
});
