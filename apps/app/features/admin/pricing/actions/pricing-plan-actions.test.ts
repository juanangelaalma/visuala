import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), services: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/application/auth/require-admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/application/pricing/services", () => ({ createPricingServices: mocks.services }));
vi.mock("@/application/pricing/create-pricing-plan", () => ({ createPricingPlan: mocks.create }));
vi.mock("@/application/pricing/update-pricing-plan", () => ({ updatePricingPlan: mocks.update }));
vi.mock("@/application/pricing/delete-pricing-plan", () => ({ deletePricingPlan: mocks.remove }));
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
  beforeEach(() => { vi.clearAllMocks(); mocks.services.mockResolvedValue({ pricingPlanRepository: {} }); });

  it("authenticates before rejecting invalid plan", async () => {
    expect(await savePricingPlanAction({}, new FormData())).toHaveProperty("error");
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it("creates plan after authentication with parsed input", async () => {
    const repository = {};
    mocks.services.mockResolvedValue({ pricingPlanRepository: repository });
    expect(await savePricingPlanAction({}, form())).toEqual({ message: "Pricing plan saved." });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.services).toHaveBeenCalledWith({ writable: true });
    expect(mocks.create).toHaveBeenCalledWith(repository, input);
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.services.mock.invocationCallOrder[0]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/pricing");
  });

  it("updates plan after authentication with id and parsed input", async () => {
    const repository = {};
    const id = "123e4567-e89b-12d3-a456-426614174000";
    mocks.services.mockResolvedValue({ pricingPlanRepository: repository });
    expect(await savePricingPlanAction({}, form(id))).toEqual({ message: "Pricing plan saved." });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.services).toHaveBeenCalledWith({ writable: true });
    expect(mocks.update).toHaveBeenCalledWith(repository, id, input);
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.services.mock.invocationCallOrder[0]);
  });

  it("returns safe save failure", async () => {
    mocks.create.mockRejectedValue(new Error("database detail"));
    expect(await savePricingPlanAction({}, form())).toEqual({ error: "Could not save pricing plan." });
  });

  it("authenticates before ignoring missing delete id", async () => {
    await deletePricingPlanAction(new FormData());
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes plan after authentication with exact id", async () => {
    const repository = {};
    mocks.services.mockResolvedValue({ pricingPlanRepository: repository });
    const data = new FormData(); data.set("id", "plan-1");
    await deletePricingPlanAction(data);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.services).toHaveBeenCalledWith({ writable: true });
    expect(mocks.remove).toHaveBeenCalledWith(repository, "plan-1");
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.services.mock.invocationCallOrder[0]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/pricing");
  });

  it("swallows delete failure", async () => {
    mocks.remove.mockRejectedValue(new Error("database detail"));
    const data = new FormData(); data.set("id", "plan-1");
    await deletePricingPlanAction(data);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
