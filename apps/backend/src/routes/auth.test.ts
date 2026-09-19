import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  publicClient: vi.fn(),
  userClient: vi.fn(),
  userRepository: vi.fn(),
  findById: vi.fn(),
  upsert: vi.fn(),
  services: vi.fn(),
  userRepositoryFor: vi.fn(),
  authProvider: {
    registerWithEmail: vi.fn(),
    loginWithEmail: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    loginWithOAuth: vi.fn(),
  },
}));

vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "http://localhost:3000", ADMIN_EMAILS: "" }) }));
vi.mock("@/infrastructure/supabase/clients", () => ({
  createSupabasePublicClient: mocks.publicClient,
  createSupabaseUserClient: mocks.userClient,
}));
vi.mock("@/infrastructure/auth/supabase-user-repository", () => ({ SupabaseUserRepository: mocks.userRepository }));
vi.mock("@/application/auth/services", () => ({ createAuthServices: mocks.services }));

import { AuthDomainError } from "@/domain/auth/errors";
import { createApp } from "@/app";

const authUser = { id: "user-1", email: "user@example.com", fullName: null, avatarUrl: null };
const profile = { id: "user-1", email: "user@example.com", fullName: null, avatarUrl: null, role: "user", createdAt: "now", updatedAt: "now" };
const session = { accessToken: "access", refreshToken: "refresh" };

function send(path: string, body?: unknown, token?: string) {
  return createApp().handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com", user_metadata: {} } }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.userRepository.mockReturnValue({ findById: mocks.findById, upsert: mocks.upsert });
    mocks.findById.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(profile);
    mocks.userRepositoryFor.mockReturnValue({ findById: mocks.findById, upsert: mocks.upsert });
    mocks.services.mockReturnValue({ authProvider: mocks.authProvider, userRepositoryFor: mocks.userRepositoryFor });
    mocks.authProvider.registerWithEmail.mockResolvedValue({ user: authUser, session: null });
    mocks.authProvider.loginWithEmail.mockResolvedValue({ user: authUser, session });
    mocks.authProvider.resendConfirmationEmail.mockResolvedValue(undefined);
    mocks.authProvider.loginWithOAuth.mockResolvedValue("https://accounts.test");
  });

  describe("POST /auth/register", () => {
    it("rejects an invalid body", async () => {
      const response = await send("/auth/register", { email: "not-an-email", password: "short" });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
      expect(mocks.authProvider.registerWithEmail).not.toHaveBeenCalled();
    });

    it("registers, resends confirmation and reports the pending session", async () => {
      const response = await send("/auth/register", { email: "user@example.com", password: "password123", fullName: "Jane" });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ user: authUser, profile: null, session: null });
      expect(mocks.authProvider.registerWithEmail).toHaveBeenCalledWith({ email: "user@example.com", password: "password123", fullName: "Jane" });
      expect(mocks.authProvider.resendConfirmationEmail).toHaveBeenCalledWith({ email: "user@example.com" });
    });

    it("reports a null result when the provider yields no user", async () => {
      mocks.authProvider.registerWithEmail.mockResolvedValue(null);

      const response = await send("/auth/register", { email: "user@example.com", password: "password123" });

      await expect(response.json()).resolves.toEqual({ user: null, profile: null, session: null });
    });

    it("still succeeds when the confirmation resend fails", async () => {
      mocks.authProvider.resendConfirmationEmail.mockRejectedValue(new AuthDomainError("rate_limited", "Please wait a moment before requesting another confirmation email."));

      const response = await send("/auth/register", { email: "user@example.com", password: "password123" });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /auth/login", () => {
    it("rejects an invalid body", async () => {
      const response = await send("/auth/login", { email: "user@example.com" });

      expect(response.status).toBe(422);
      expect(mocks.authProvider.loginWithEmail).not.toHaveBeenCalled();
    });

    it("returns the user, synced profile and session for the browser to adopt", async () => {
      const response = await send("/auth/login", { email: "user@example.com", password: "password123" });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ user: authUser, profile, session });
      expect(mocks.userRepositoryFor).toHaveBeenCalledWith(session);
    });

    it("reports a null result as unauthorized", async () => {
      mocks.authProvider.loginWithEmail.mockResolvedValue(null);

      const response = await send("/auth/login", { email: "user@example.com", password: "password123" });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Invalid email or password." });
    });

    it("maps invalid credentials to a 401 with the domain message", async () => {
      mocks.authProvider.loginWithEmail.mockRejectedValue(new AuthDomainError("invalid_credentials", "Invalid email or password."));

      const response = await send("/auth/login", { email: "user@example.com", password: "password123" });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Invalid email or password." });
    });

    it("maps an unconfirmed email to 403", async () => {
      mocks.authProvider.loginWithEmail.mockRejectedValue(new AuthDomainError("email_not_confirmed", "Please confirm your email before logging in."));

      const response = await send("/auth/login", { email: "user@example.com", password: "password123" });

      expect(response.status).toBe(403);
    });
  });

  describe("POST /auth/resend-confirmation", () => {
    it("rejects an invalid body", async () => {
      const response = await send("/auth/resend-confirmation", { email: "nope" });

      expect(response.status).toBe(422);
    });

    it("returns an enumeration safe message", async () => {
      const response = await send("/auth/resend-confirmation", { email: "user@example.com" });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ message: "If an account exists, we sent a confirmation email." });
    });

    it("surfaces rate limiting", async () => {
      mocks.authProvider.resendConfirmationEmail.mockRejectedValue(new AuthDomainError("rate_limited", "Please wait a moment before requesting another confirmation email."));

      const response = await send("/auth/resend-confirmation", { email: "user@example.com" });

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({ error: "Please wait a moment before requesting another confirmation email." });
    });

    it("swallows other failures to avoid account enumeration", async () => {
      mocks.authProvider.resendConfirmationEmail.mockRejectedValue(new AuthDomainError("server_error", "Authentication failed. Please try again."));

      const response = await send("/auth/resend-confirmation", { email: "user@example.com" });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ message: "If an account exists, we sent a confirmation email." });
    });
  });

  describe("POST /auth/oauth/google", () => {
    it("returns the provider URL built from the app origin", async () => {
      const response = await send("/auth/oauth/google");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ url: "https://accounts.test" });
      expect(mocks.authProvider.loginWithOAuth).toHaveBeenCalledWith({ provider: "google", redirectTo: "http://localhost:3000/auth/callback" });
    });

    it("maps an oauth failure to 502", async () => {
      mocks.authProvider.loginWithOAuth.mockRejectedValue(new AuthDomainError("oauth_error", "Could not start Google sign in. Please try again."));

      const response = await send("/auth/oauth/google");

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: "Could not start Google sign in. Please try again." });
    });
  });

  describe("POST /auth/sync-profile", () => {
    it("requires authentication", async () => {
      const response = await send("/auth/sync-profile");

      expect(response.status).toBe(401);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("ensures the profile for the authenticated user", async () => {
      const response = await send("/auth/sync-profile", undefined, "token");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ user: authUser, profile });
      expect(mocks.userRepository).toHaveBeenCalledWith({ scoped: true });
    });
  });
});
