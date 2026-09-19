import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ publicClient: vi.fn(), listActive: vi.fn(), repository: vi.fn() }));

vi.mock("@/infrastructure/supabase/clients", () => ({ createSupabasePublicClient: mocks.publicClient }));
vi.mock("@/infrastructure/pricing/supabase-pricing-plan-repository", () => ({ SupabasePricingPlanRepository: mocks.repository }));

import { createApp } from "@/app";

function get(path = "/pricing-plans") {
  return createApp().handle(new Request(`http://localhost${path}`));
}

describe("GET /pricing-plans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicClient.mockReturnValue({ anon: true });
    mocks.repository.mockReturnValue({ listActive: mocks.listActive });
  });

  it("returns active plans with the public cache policy", async () => {
    mocks.listActive.mockResolvedValue([{ id: "plan-1" }]);

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
    await expect(response.json()).resolves.toEqual({ plans: [{ id: "plan-1" }] });
    expect(mocks.repository).toHaveBeenCalledWith({ anon: true });
  });

  it("returns a safe 500 when the repository fails", async () => {
    mocks.listActive.mockRejectedValue(new Error("database detail"));

    const response = await get();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not load pricing plans.", plans: [] });
  });
});
