import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), list: vi.fn() }));
vi.mock("@/infrastructure/supabase/public-server-client", () => ({ createSupabasePublicServerClient: mocks.client }));
vi.mock("@/application/pricing/list-active-pricing-plans", () => ({ listActivePricingPlans: mocks.list }));
vi.mock("@/infrastructure/pricing/supabase-pricing-plan-repository", () => ({ SupabasePricingPlanRepository: vi.fn() }));
import { GET } from "./route";

describe("pricing plans route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active plans with cache policy", async () => {
    mocks.client.mockReturnValue({});
    mocks.list.mockResolvedValue([{ id: "plan-1" }]);
    const response = await GET();
    expect({ body: await response.json(), cache: response.headers.get("Cache-Control") }).toEqual({ body: { plans: [{ id: "plan-1" }] }, cache: "public, s-maxage=300, stale-while-revalidate=3600" });
  });

  it("returns safe server error", async () => {
    mocks.client.mockImplementation(() => { throw new Error("database detail"); });
    const response = await GET();
    expect({ status: response.status, body: await response.json() }).toEqual({ status: 500, body: { error: "Could not load pricing plans.", plans: [] } });
  });
});
