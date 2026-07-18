import { describe, expect, it, vi } from "vitest";
import { AuthDomainError } from "@/domain/auth/errors";
import { SupabaseAuthAdapter } from "./supabase-auth-adapter";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://accounts.test" }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      ...overrides,
    },
  };
}

describe("SupabaseAuthAdapter", () => {
  it("maps registration input to Supabase metadata", async () => {
    const client = makeClient();
    const adapter = new SupabaseAuthAdapter(client as never);

    await adapter.registerWithEmail({ email: "user@example.com", password: "password", fullName: "User" });

    expect(client.auth.signUp).toHaveBeenCalledWith({ email: "user@example.com", password: "password", options: { data: { full_name: "User" } } });
  });

  it.each([
    ["Email not confirmed", "email_not_confirmed"],
    ["Rate limit exceeded", "rate_limited"],
    ["Too many requests", "rate_limited"],
    ["For security purposes", "rate_limited"],
    ["Invalid login", "invalid_credentials"],
    ["Invalid credentials", "invalid_credentials"],
    ["Already registered", "email_already_registered"],
    ["Already exists", "email_already_registered"],
    ["Unknown", "server_error"],
  ])("maps %s login errors to %s", async (message, code) => {
    const client = makeClient({ signInWithPassword: vi.fn().mockResolvedValue({ error: { message } }) });
    const adapter = new SupabaseAuthAdapter(client as never);

    const result = adapter.loginWithEmail({ email: "user@example.com", password: "password" });

    await expect(result).rejects.toMatchObject({ code });
  });

  it("resends signup confirmation", async () => {
    const client = makeClient();
    const adapter = new SupabaseAuthAdapter(client as never);

    await adapter.resendConfirmationEmail({ email: "user@example.com" });

    expect(client.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "user@example.com" });
  });

  it("returns OAuth URL", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient() as never);

    const url = await adapter.loginWithOAuth({ provider: "google", redirectTo: "https://app.test/callback" });

    expect(url).toBe("https://accounts.test");
  });

  it.each([
    [{ data: { url: null }, error: null }],
    [{ data: { url: null }, error: { message: "provider failed" } }],
  ])("rejects unavailable OAuth login", async (response) => {
    const adapter = new SupabaseAuthAdapter(makeClient({ signInWithOAuth: vi.fn().mockResolvedValue(response) }) as never);

    const result = adapter.loginWithOAuth({ provider: "google", redirectTo: "https://app.test/callback" });

    await expect(result).rejects.toBeInstanceOf(AuthDomainError);
  });

  it("maps logout failure to safe domain error", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient({ signOut: vi.fn().mockResolvedValue({ error: {} }) }) as never);

    const result = adapter.logout();

    await expect(result).rejects.toMatchObject({ code: "server_error" });
  });

  it("returns current user with safe metadata", async () => {
    const user = { id: "user-1", email: "user@example.com", user_metadata: { full_name: "User", avatar_url: 42 } };
    const adapter = new SupabaseAuthAdapter(makeClient({ getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) }) as never);

    const result = await adapter.getCurrentUser();

    expect(result).toEqual({ id: "user-1", email: "user@example.com", fullName: "User", avatarUrl: null });
  });

  it("returns null when current user lookup fails", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient({ getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: {} }) }) as never);

    const result = await adapter.getCurrentUser();

    expect(result).toBeNull();
  });
});
