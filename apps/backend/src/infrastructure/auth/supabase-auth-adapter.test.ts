import { describe, expect, it, vi } from "vitest";
import { AuthDomainError } from "@/domain/auth/errors";
import { SupabaseAuthAdapter } from "./supabase-auth-adapter";

const supabaseUser = { id: "user-1", email: "user@example.com", user_metadata: { full_name: "User", avatar_url: null } };
const session = { access_token: "access", refresh_token: "refresh" };

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { user: supabaseUser, session }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: supabaseUser, session }, error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://accounts.test" }, error: null }),
      ...overrides,
    },
  };
}

describe("SupabaseAuthAdapter", () => {
  it("maps registration input to Supabase metadata and returns the session", async () => {
    const client = makeClient();
    const adapter = new SupabaseAuthAdapter(client as never);

    await expect(adapter.registerWithEmail({ email: "user@example.com", password: "password", fullName: "User" })).resolves.toEqual({
      user: { id: "user-1", email: "user@example.com", fullName: "User", avatarUrl: null },
      session: { accessToken: "access", refreshToken: "refresh" },
    });

    expect(client.auth.signUp).toHaveBeenCalledWith({ email: "user@example.com", password: "password", options: { data: { full_name: "User" } } });
  });

  it("reports a null session while email confirmation is pending", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient({ signUp: vi.fn().mockResolvedValue({ data: { user: supabaseUser, session: null }, error: null }) }) as never);

    await expect(adapter.registerWithEmail({ email: "user@example.com", password: "password" })).resolves.toMatchObject({ session: null });
  });

  it("returns null when sign up yields no user", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient({ signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }) }) as never);

    await expect(adapter.registerWithEmail({ email: "user@example.com", password: "password" })).resolves.toBeNull();
  });

  it("returns the signed in user and session", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient() as never);

    await expect(adapter.loginWithEmail({ email: "user@example.com", password: "password" })).resolves.toEqual({
      user: { id: "user-1", email: "user@example.com", fullName: "User", avatarUrl: null },
      session: { accessToken: "access", refreshToken: "refresh" },
    });
  });

  it("returns null when a user has no email", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient({ signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: undefined, user_metadata: {} }, session }, error: null }) }) as never);

    await expect(adapter.loginWithEmail({ email: "user@example.com", password: "password" })).resolves.toBeNull();
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
    const adapter = new SupabaseAuthAdapter(makeClient({ signInWithPassword: vi.fn().mockResolvedValue({ error: { message } }) }) as never);

    await expect(adapter.loginWithEmail({ email: "user@example.com", password: "password" })).rejects.toMatchObject({ code });
  });

  it("resends signup confirmation", async () => {
    const client = makeClient();
    const adapter = new SupabaseAuthAdapter(client as never);

    await adapter.resendConfirmationEmail({ email: "user@example.com" });

    expect(client.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "user@example.com" });
  });

  it("maps a resend failure to a safe domain error", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient({ resend: vi.fn().mockResolvedValue({ error: { message: "Too many requests" } }) }) as never);

    await expect(adapter.resendConfirmationEmail({ email: "user@example.com" })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("returns the OAuth URL", async () => {
    const adapter = new SupabaseAuthAdapter(makeClient() as never);

    await expect(adapter.loginWithOAuth({ provider: "google", redirectTo: "https://app.test/auth/callback" })).resolves.toBe("https://accounts.test");
  });

  it.each([[{ data: { url: null }, error: null }], [{ data: { url: null }, error: { message: "provider failed" } }]])("rejects an unavailable OAuth login", async (response) => {
    const adapter = new SupabaseAuthAdapter(makeClient({ signInWithOAuth: vi.fn().mockResolvedValue(response) }) as never);

    await expect(adapter.loginWithOAuth({ provider: "google", redirectTo: "https://app.test/auth/callback" })).rejects.toBeInstanceOf(AuthDomainError);
  });
});
