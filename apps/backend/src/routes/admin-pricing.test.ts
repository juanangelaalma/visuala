import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  publicClient: vi.fn(),
  userClient: vi.fn(),
  userRepository: vi.fn(),
  findById: vi.fn(),
  repository: vi.fn(),
  listAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({
  createSupabasePublicClient: mocks.publicClient,
  createSupabaseUserClient: mocks.userClient,
}));
vi.mock("@/infrastructure/auth/supabase-user-repository", () => ({ SupabaseUserRepository: mocks.userRepository }));
vi.mock("@/infrastructure/pricing/supabase-pricing-plan-repository", () => ({ SupabasePricingPlanRepository: mocks.repository }));

import { createApp } from "@/app";

const plan = {
  slug: "pro",
  name: "Pro",
  priceAmount: 100,
  currency: "IDR",
  billingPeriod: "monthly",
  billingLabel: "/month",
  compareAtAmount: null,
  badgeLabel: null,
  ctaLabel: "Buy",
  credits: 10,
  bonusCredits: 0,
  creditExpiresInDays: 30,
  features: ["One"],
  isActive: true,
  isMostPopular: false,
  sortOrder: 1,
};

function send(method: string, path: string, options: { token?: string; body?: unknown } = {}) {
  return createApp().handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
  );
}

describe("admin pricing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.userRepository.mockReturnValue({ findById: mocks.findById });
    mocks.repository.mockReturnValue({ listAll: mocks.listAll, create: mocks.create, update: mocks.update, delete: mocks.remove });
  });

  it("requires authentication", async () => {
    const response = await send("GET", "/admin/pricing-plans");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(mocks.listAll).not.toHaveBeenCalled();
  });

  it("requires an admin profile", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.findById.mockResolvedValue({ id: "user-1", role: "user" });

    const response = await send("GET", "/admin/pricing-plans", { token: "token" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
    expect(mocks.listAll).not.toHaveBeenCalled();
  });

  it("lists every plan for an admin", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.findById.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.listAll.mockResolvedValue([{ id: "plan-1" }]);

    const response = await send("GET", "/admin/pricing-plans", { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ plans: [{ id: "plan-1" }] });
  });

  it("creates a plan", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.findById.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.create.mockResolvedValue({ id: "plan-1", ...plan });

    const response = await send("POST", "/admin/pricing-plans", { token: "token", body: plan });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ plan: { id: "plan-1", ...plan } });
    expect(mocks.create).toHaveBeenCalledWith(plan);
  });

  it("updates a plan by id", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.findById.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.update.mockResolvedValue({ id: "plan-1", ...plan });

    const response = await send("PUT", "/admin/pricing-plans/plan-1", { token: "token", body: plan });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("plan-1", plan);
  });

  it("deletes a plan by id", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.findById.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.remove.mockResolvedValue(undefined);

    const response = await send("DELETE", "/admin/pricing-plans/plan-1", { token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith("plan-1");
  });

  it("validates the request body before touching the repository", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.findById.mockResolvedValue({ id: "admin-1", role: "admin" });

    const response = await send("POST", "/admin/pricing-plans", { token: "token", body: { ...plan, slug: "Not A Slug" } });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("validates the update body before touching the repository", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.findById.mockResolvedValue({ id: "admin-1", role: "admin" });

    const response = await send("PUT", "/admin/pricing-plans/plan-1", { token: "token", body: { ...plan, credits: 0 } });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
