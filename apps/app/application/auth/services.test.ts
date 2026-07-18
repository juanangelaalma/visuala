import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ server: vi.fn(), writable: vi.fn() }));
vi.mock("@/infrastructure/supabase/server-client", () => ({ createSupabaseServerClient: mocks.server, createSupabaseWritableServerClient: mocks.writable }));
import { SupabaseAuthAdapter } from "@/infrastructure/auth/supabase-auth-adapter";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { createAuthServices, createAuthServicesFromSupabase, createWritableAuthServices } from "./services";

function client() {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) } };
}

describe("auth service factories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates services wired to supplied client", async () => {
    const suppliedClient = client();
    const result = createAuthServicesFromSupabase(suppliedClient as never);
    expect(result.authProvider).toBeInstanceOf(SupabaseAuthAdapter);
    expect(result.userRepository).toBeInstanceOf(SupabaseUserRepository);
    await result.authProvider.getCurrentUser();
    expect(suppliedClient.auth.getUser).toHaveBeenCalledOnce();
  });

  it("uses readonly server client", async () => {
    const readonlyClient = client();
    mocks.server.mockResolvedValue(readonlyClient);
    const result = await createAuthServices();
    await result.authProvider.getCurrentUser();
    expect(mocks.server).toHaveBeenCalledOnce();
    expect(mocks.writable).not.toHaveBeenCalled();
    expect(readonlyClient.auth.getUser).toHaveBeenCalledOnce();
  });

  it("uses writable server client", async () => {
    const writableClient = client();
    mocks.writable.mockResolvedValue(writableClient);
    const result = await createWritableAuthServices();
    await result.authProvider.getCurrentUser();
    expect(mocks.writable).toHaveBeenCalledOnce();
    expect(mocks.server).not.toHaveBeenCalled();
    expect(writableClient.auth.getUser).toHaveBeenCalledOnce();
  });
});
