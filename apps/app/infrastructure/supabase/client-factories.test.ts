import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServer: vi.fn(), createClient: vi.fn(), cookies: vi.fn(), env: vi.fn(), next: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServer }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/server", () => ({ NextResponse: { next: mocks.next } }));
vi.mock("@/shared/config/env", () => ({ getAppEnv: mocks.env }));
vi.mock("server-only", () => ({}));

import { createSupabasePublicServerClient } from "./public-server-client";
import { createSupabaseProxyClient } from "./proxy-client";
import { createSupabaseServerClient, createSupabaseWritableServerClient } from "./server-client";
import { createSupabaseServiceRoleClient } from "./service-role-client";

describe("Supabase client factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.mockReturnValue({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    mocks.createClient.mockReturnValue({ client: true });
    mocks.createServer.mockReturnValue({ server: true });
  });

  it("creates stateless public client", () => {
    expect(createSupabasePublicServerClient()).toEqual({ client: true });
    expect(mocks.createClient).toHaveBeenCalledWith("https://project.supabase.co", "anon", { auth: { persistSession: false, autoRefreshToken: false } });
  });

  it("creates service-role client", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    try {
      expect(createSupabaseServiceRoleClient()).toEqual({ client: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reads cookies without writing in readonly mode", async () => {
    const store = { getAll: vi.fn().mockReturnValue([{ name: "a", value: "b" }]), set: vi.fn() };
    mocks.cookies.mockResolvedValue(store);
    await createSupabaseServerClient();
    const options = mocks.createServer.mock.calls[0]?.[2];
    expect(options.cookies.getAll()).toEqual([{ name: "a", value: "b" }]);
    options.cookies.setAll([{ name: "a", value: "c", options: {} }]);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("writes cookies in writable mode", async () => {
    const store = { getAll: vi.fn(), set: vi.fn() };
    mocks.cookies.mockResolvedValue(store);
    await createSupabaseWritableServerClient();
    mocks.createServer.mock.calls[0]?.[2].cookies.setAll([{ name: "a", value: "c", options: { path: "/" } }]);
    expect(store.set).toHaveBeenCalledWith("a", "c", { path: "/" });
  });

  it("bridges proxy request and response cookies", () => {
    const response = { cookies: { set: vi.fn() } };
    mocks.next.mockReturnValue(response);
    const request = { cookies: { getAll: vi.fn().mockReturnValue([]), set: vi.fn() } };
    const result = createSupabaseProxyClient(request as never);
    const options = mocks.createServer.mock.calls[0]?.[2];
    expect(options.cookies.getAll()).toEqual([]);
    options.cookies.setAll([{ name: "token", value: "value", options: { httpOnly: true } }]);
    expect(request.cookies.set).toHaveBeenCalledWith("token", "value");
    expect(result.supabase).toEqual({ server: true });
  });
});
