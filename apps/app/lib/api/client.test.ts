import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), getSession: vi.fn(), fetch: vi.fn(), env: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/supabase/server-client", () => ({ createSupabaseServerClient: mocks.createServerClient }));
vi.mock("@/shared/config/env", () => ({ getAppEnv: mocks.env }));

import { ApiError, apiFetch } from "./client";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.mockReturnValue({ NEXT_PUBLIC_API_URL: "http://localhost:4000" });
    mocks.createServerClient.mockResolvedValue({ auth: { getSession: mocks.getSession } });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("forwards the supabase access token to the backend", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "jwt-1" } } });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ plans: [] }), { status: 200 }));

    await expect(apiFetch("/pricing-plans")).resolves.toEqual({ plans: [] });

    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url.toString()).toBe("http://localhost:4000/pricing-plans");
    expect(init).toMatchObject({
      method: "GET",
      headers: { "content-type": "application/json", authorization: "Bearer jwt-1" },
      cache: "no-store",
    });
  });

  it("omits the authorization header when there is no session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

    await apiFetch("/health");

    expect(mocks.fetch.mock.calls[0][1].headers).toEqual({ "content-type": "application/json" });
  });

  it("prefers an explicit access token over the cookie session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "cookie-token" } } });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ profile: null }), { status: 200 }));

    await apiFetch("/auth/sync-profile", { method: "POST", accessToken: "fresh-token" });

    expect(mocks.fetch.mock.calls[0][1].headers).toMatchObject({ authorization: "Bearer fresh-token" });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("serializes a json body for writes", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "jwt-2" } } });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "plan-1" }), { status: 200 }));

    await apiFetch("/pricing-plans", { method: "POST", body: { name: "Starter" } });

    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ name: "Starter" }) });
  });

  it("throws an ApiError carrying the status and payload", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "jwt-3" } } });
    mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 }));

    await expect(apiFetch("/me")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/me")).rejects.toMatchObject({ name: "ApiError", status: 401, payload: { error: "Unauthorized." } });
  });

  it("tolerates a non json error response", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.fetch.mockResolvedValue(new Response("gateway timeout", { status: 503 }));

    await expect(apiFetch("/me")).rejects.toMatchObject({ status: 503, payload: null });
  });
});
