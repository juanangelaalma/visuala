import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  publicClient: vi.fn(),
  userClient: vi.fn(),
  userRepository: vi.fn(),
  findById: vi.fn(),
  creditRepository: vi.fn(),
  findWalletByOwner: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({
  createSupabasePublicClient: mocks.publicClient,
  createSupabaseUserClient: mocks.userClient,
}));
vi.mock("@/infrastructure/auth/supabase-user-repository", () => ({ SupabaseUserRepository: mocks.userRepository }));
vi.mock("@/infrastructure/credits/supabase-credit-repository", () => ({ SupabaseCreditRepository: mocks.creditRepository }));

import { createApp } from "@/app";

function get(path: string, token?: string) {
  return createApp().handle(
    new Request(`http://localhost${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

describe("me routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.userRepository.mockReturnValue({ findById: mocks.findById });
    mocks.creditRepository.mockReturnValue({ findWalletByOwner: mocks.findWalletByOwner });
  });

  describe("GET /me", () => {
    it("rejects anonymous requests", async () => {
      const response = await get("/me");

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    });

    it("returns the auth user and profile", async () => {
      mocks.getUser.mockResolvedValue({
        data: { user: { id: "user-1", email: "user@example.com", user_metadata: { full_name: "User" } } },
        error: null,
      });
      mocks.findById.mockResolvedValue({ id: "user-1", role: "user" });

      const response = await get("/me", "token");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        user: { id: "user-1", email: "user@example.com", fullName: "User", avatarUrl: null },
        profile: { id: "user-1", role: "user" },
      });
    });

    it("returns null profile when the profile row is missing", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com", user_metadata: {} } }, error: null });
      mocks.findById.mockResolvedValue(null);

      const response = await get("/me", "token");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ profile: null });
    });

    it("rejects a user without an email", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: undefined, user_metadata: {} } }, error: null });

      const response = await get("/me", "token");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /me/credits", () => {
    it("rejects anonymous requests", async () => {
      const response = await get("/me/credits");

      expect(response.status).toBe(401);
    });

    it("returns the wallet balance", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com", user_metadata: {} } }, error: null });
      mocks.findWalletByOwner.mockResolvedValue({ userId: "user-1", balance: 12500 });

      const response = await get("/me/credits", "token");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ balance: 12500 });
      expect(mocks.findWalletByOwner).toHaveBeenCalledWith("user-1");
    });

    it("falls back to zero without a wallet", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com", user_metadata: {} } }, error: null });
      mocks.findWalletByOwner.mockResolvedValue(null);

      const response = await get("/me/credits", "token");

      await expect(response.json()).resolves.toEqual({ balance: 0 });
    });
  });
});
