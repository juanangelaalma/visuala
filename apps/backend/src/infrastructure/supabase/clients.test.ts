import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { createSupabasePublicClient, createSupabaseServiceRoleClient, createSupabaseUserClient } from "./clients";

const environment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
};

describe("Supabase client factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({ client: true });
  });

  it("creates a stateless public client with the anon key", () => {
    expect(createSupabasePublicClient(environment)).toEqual({ client: true });
    expect(mocks.createClient).toHaveBeenCalledWith("https://project.supabase.co", "anon", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("forwards the access token as a bearer authorization header", () => {
    expect(createSupabaseUserClient("token-123", environment)).toEqual({ client: true });
    expect(mocks.createClient).toHaveBeenCalledWith("https://project.supabase.co", "anon", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer token-123" } },
    });
  });

  it("creates a service-role client that bypasses RLS", () => {
    expect(createSupabaseServiceRoleClient(environment)).toEqual({ client: true });
    expect(mocks.createClient).toHaveBeenCalledWith("https://project.supabase.co", "service-role-secret", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it("rejects a missing service-role key", () => {
    expect(() => createSupabaseServiceRoleClient({ ...environment, SUPABASE_SERVICE_ROLE_KEY: undefined })).toThrow();
  });
});
