import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createBrowserClient: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createBrowserClient: mocks.createBrowserClient }));

import { createSupabaseBrowserClient } from "./browser-client";

describe("createSupabaseBrowserClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
  });

  it("creates and caches one browser client with only public configuration", () => {
    const client = { auth: { getSession: vi.fn() } };
    mocks.createBrowserClient.mockReturnValue(client);

    expect(createSupabaseBrowserClient()).toBe(client);
    expect(createSupabaseBrowserClient()).toBe(client);
    expect(mocks.createBrowserClient).toHaveBeenCalledOnce();
    expect(mocks.createBrowserClient).toHaveBeenCalledWith("https://project.supabase.co", "public-anon-key");
  });
});
