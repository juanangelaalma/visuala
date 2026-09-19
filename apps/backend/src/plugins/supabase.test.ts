import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), publicClient: vi.fn(), userClient: vi.fn(), userRepository: vi.fn(), findById: vi.fn() }));

vi.mock("@/infrastructure/supabase/clients", () => ({
  createSupabasePublicClient: mocks.publicClient,
  createSupabaseUserClient: mocks.userClient,
}));

vi.mock("@/infrastructure/auth/supabase-user-repository", () => ({ SupabaseUserRepository: mocks.userRepository }));

import { authPlugin, readBearerToken } from "./supabase";

function buildApp() {
  return new Elysia()
    .use(authPlugin)
    .get("/protected", ({ user }: { user: { id: string } }) => ({ id: user.id }), { auth: true })
    .get("/admins-only", ({ profile }: { profile: { id: string; role: string } }) => ({ id: profile.id, role: profile.role }), { admin: true });
}

function request(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { headers });
}

describe("readBearerToken", () => {
  it.each([
    [null, null],
    ["", null],
    ["Token abc", null],
    ["Bearer", null],
    ["Bearer ", null],
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
    ["BEARER abc", "abc"],
  ])("parses %s", (header, expected) => {
    expect(readBearerToken(header)).toBe(expected);
  });
});

describe("supabase auth plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.userRepository.mockReturnValue({ findById: mocks.findById });
  });

  describe("auth", () => {
    it("rejects a request without an authorization header", async () => {
      const response = await buildApp().handle(request("/protected"));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
      expect(mocks.getUser).not.toHaveBeenCalled();
    });

    it("rejects a malformed authorization header", async () => {
      const response = await buildApp().handle(request("/protected", { authorization: "Token abc" }));

      expect(response.status).toBe(401);
      expect(mocks.getUser).not.toHaveBeenCalled();
    });

    it("rejects a token supabase does not recognize", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid jwt") });

      const response = await buildApp().handle(request("/protected", { authorization: "Bearer bad-token" }));

      expect(response.status).toBe(401);
      expect(mocks.getUser).toHaveBeenCalledWith("bad-token");
      expect(mocks.userClient).not.toHaveBeenCalled();
    });

    it("resolves the user and a token scoped client", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

      const response = await buildApp().handle(request("/protected", { authorization: "Bearer good-token" }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ id: "user-1" });
      expect(mocks.getUser).toHaveBeenCalledWith("good-token");
      expect(mocks.userClient).toHaveBeenCalledWith("good-token");
    });

    it("leaves routes without an auth flag public", async () => {
      const app = new Elysia().use(authPlugin).get("/public", () => ({ ok: true }));

      const response = await app.handle(new Request("http://localhost/public"));

      expect(response.status).toBe(200);
      expect(mocks.getUser).not.toHaveBeenCalled();
    });
  });

  describe("admin", () => {
    it("rejects anonymous requests with 401 before reading a profile", async () => {
      const response = await buildApp().handle(request("/admins-only"));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
      expect(mocks.findById).not.toHaveBeenCalled();
    });

    it("rejects authenticated non-admin users with 403", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
      mocks.findById.mockResolvedValue({ id: "user-1", role: "user" });

      const response = await buildApp().handle(request("/admins-only", { authorization: "Bearer token" }));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
      expect(mocks.findById).toHaveBeenCalledWith("user-1");
    });

    it("rejects authenticated users without a profile row", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
      mocks.findById.mockResolvedValue(null);

      const response = await buildApp().handle(request("/admins-only", { authorization: "Bearer token" }));

      expect(response.status).toBe(403);
    });

    it("resolves the admin profile", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
      mocks.findById.mockResolvedValue({ id: "admin-1", role: "admin" });

      const response = await buildApp().handle(request("/admins-only", { authorization: "Bearer token" }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ id: "admin-1", role: "admin" });
      expect(mocks.userRepository).toHaveBeenCalledWith({ scoped: true });
    });
  });
});
