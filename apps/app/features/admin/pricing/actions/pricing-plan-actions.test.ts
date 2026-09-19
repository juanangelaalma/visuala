import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), api: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/api/client", () => ({ apiFetch: mocks.api }));
import { deletePricingPlanAction, savePricingPlanAction } from "./pricing-plan-actions";

const input = { slug: "pro", name: "Pro", priceAmount: 100, currency: "IDR", billingPeriod: "monthly", billingLabel: "Monthly", compareAtAmount: null, badgeLabel: null, ctaLabel: "Buy", credits: 10, bonusCredits: 0, creditExpiresInDays: 30, features: ["One"], isActive: true, isMostPopular: false, sortOrder: 1 };

function form(id?: string) {
  const data = new FormData();
  const values = { slug: "pro", name: "Pro", priceAmount: "100", currency: "IDR", billingPeriod: "monthly", billingLabel: "Monthly", compareAtAmount: "", badgeLabel: "", ctaLabel: "Buy", credits: "10", bonusCredits: "0", creditExpiresInDays: "30", features: "One", isActive: "true", isMostPopular: "false", sortOrder: "1" };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (id) data.set("id", id);
  return data;
}

describe("pricing plan actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue(undefined);
    mocks.api.mockResolvedValue(undefined);
  });

  it("authenticates before rejecting invalid plan", async () => {
    expect(await savePricingPlanAction({}, new FormData())).toHaveProperty("error");
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("creates plan after authentication with parsed input", async () => {
    expect(await savePricingPlanAction({}, form())).toEqual({ message: "Pricing plan saved." });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith("/admin/pricing-plans", { method: "POST", body: input });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.mock.invocationCallOrder[0]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/pricing");
  });

  it("updates plan after authentication with id and parsed input", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(await savePricingPlanAction({}, form(id))).toEqual({ message: "Pricing plan saved." });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith(`/admin/pricing-plans/${id}`, { method: "PUT", body: input });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.mock.invocationCallOrder[0]);
  });

  it("returns safe save failure", async () => {
    mocks.api.mockRejectedValue(new Error("backend detail"));
    expect(await savePricingPlanAction({}, form())).toEqual({ error: "Could not save pricing plan." });
  });

  it("authenticates before ignoring missing delete id", async () => {
    await deletePricingPlanAction(new FormData());
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("deletes plan after authentication with exact id", async () => {
    const data = new FormData();
    data.set("id", "plan-1");
    await deletePricingPlanAction(data);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith("/admin/pricing-plans/plan-1", { method: "DELETE" });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.mock.invocationCallOrder[0]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/pricing");
  });

  it("swallows delete failure", async () => {
    mocks.api.mockRejectedValue(new Error("backend detail"));
    const data = new FormData();
    data.set("id", "plan-1");
    await deletePricingPlanAction(data);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
