import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ services: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./services", () => ({ createAuthServices: mocks.services }));
import { requireAdmin } from "./require-admin";

function services(user: unknown, profile: unknown) {
  return { authProvider: { getCurrentUser: vi.fn().mockResolvedValue(user) }, userRepository: { findById: vi.fn().mockResolvedValue(profile) } };
}

describe("requireAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects anonymous users", async () => {
    mocks.services.mockResolvedValue(services(null, null));
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(requireAdmin()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects non-admin users", async () => {
    mocks.services.mockResolvedValue(services({ id: "user-1" }, { role: "user" }));
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(requireAdmin()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns admin profile", async () => {
    const profile = { role: "admin" };
    mocks.services.mockResolvedValue(services({ id: "user-1" }, profile));
    expect(await requireAdmin()).toBe(profile);
  });
});
