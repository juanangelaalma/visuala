import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ publicClient: vi.fn(), userClient: vi.fn(), adapter: vi.fn(), repository: vi.fn() }));

vi.mock("@/infrastructure/supabase/clients", () => ({
  createSupabasePublicClient: mocks.publicClient,
  createSupabaseUserClient: mocks.userClient,
}));
vi.mock("@/infrastructure/auth/supabase-auth-adapter", () => ({ SupabaseAuthAdapter: mocks.adapter }));
vi.mock("@/infrastructure/auth/supabase-user-repository", () => ({ SupabaseUserRepository: mocks.repository }));

import { createAuthServices } from "./services";

describe("createAuthServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicClient.mockReturnValue({ anon: true });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.adapter.mockReturnValue({ adapter: true });
    mocks.repository.mockReturnValue({ repository: true });
  });

  it("wires the auth provider to the public client", () => {
    const services = createAuthServices();

    expect(services.authProvider).toEqual({ adapter: true });
    expect(mocks.publicClient).toHaveBeenCalledOnce();
    expect(mocks.adapter).toHaveBeenCalledWith({ anon: true });
  });

  it("scopes the profile repository to the issued access token", () => {
    const services = createAuthServices();

    expect(services.userRepositoryFor({ accessToken: "token", refreshToken: "refresh" })).toEqual({ repository: true });
    expect(mocks.userClient).toHaveBeenCalledWith("token");
    expect(mocks.repository).toHaveBeenCalledWith({ scoped: true });
  });

  it("falls back to the public client without a session", () => {
    const services = createAuthServices();

    expect(services.userRepositoryFor(null)).toEqual({ repository: true });
    expect(mocks.userClient).not.toHaveBeenCalled();
  });
});
