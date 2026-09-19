import { describe, expect, it, vi } from "vitest";
import type { AuthProvider, AuthResult } from "@/domain/auth/auth-provider";
import type { UserProfile } from "@/domain/auth/types";
import { authenticateAndSync } from "./authenticate-and-sync";
import { loginWithEmail } from "./login-with-email";
import { registerWithEmail } from "./register-with-email";
import { resendConfirmationEmail } from "./resend-confirmation-email";

vi.mock("@/env", () => ({ getEnv: () => ({ ADMIN_EMAILS: "" }) }));

const authUser = { id: "user-1", email: "user@example.com", fullName: "Jane Creator", avatarUrl: null };
const session = { accessToken: "access", refreshToken: "refresh" };
const profile: UserProfile = { id: "user-1", email: "user@example.com", fullName: "Jane Creator", avatarUrl: null, role: "user", createdAt: "now", updatedAt: "now" };

function createProvider(result: AuthResult | null): AuthProvider {
  return {
    registerWithEmail: vi.fn().mockResolvedValue(result),
    loginWithEmail: vi.fn().mockResolvedValue(result),
    resendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    loginWithOAuth: vi.fn().mockResolvedValue("https://accounts.test"),
  };
}

function createDependencies(result: AuthResult | null) {
  const repository = { findById: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue(profile) };
  const authProvider = createProvider(result);
  const userRepositoryFor = vi.fn(() => repository);

  return { dependencies: { authProvider, userRepositoryFor }, authProvider, repository, userRepositoryFor };
}

describe("authenticateAndSync", () => {
  it("syncs the profile through a session scoped repository", async () => {
    const { dependencies, repository, userRepositoryFor } = createDependencies({ user: authUser, session });

    await expect(loginWithEmail(dependencies, { email: "user@example.com", password: "password" })).resolves.toEqual({ user: authUser, profile, session });

    expect(userRepositoryFor).toHaveBeenCalledWith(session);
    expect(repository.upsert).toHaveBeenCalledWith({ id: "user-1", email: "user@example.com", fullName: "Jane Creator", avatarUrl: null, role: "user" });
  });

  it("skips the profile while email confirmation is pending", async () => {
    const { dependencies, repository } = createDependencies({ user: authUser, session: null });

    await expect(registerWithEmail(dependencies, { email: "user@example.com", password: "password" })).resolves.toEqual({ user: authUser, profile: null, session: null });

    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("keeps an existing profile role", async () => {
    const { dependencies, repository } = createDependencies({ user: authUser, session });
    repository.findById.mockResolvedValue({ ...profile, role: "admin" });

    await loginWithEmail(dependencies, { email: "user@example.com", password: "password" });

    expect(repository.upsert).toHaveBeenCalledWith({ id: "user-1", email: "user@example.com", fullName: "Jane Creator", avatarUrl: null });
  });

  it("returns null when the provider yields no result", async () => {
    const { dependencies } = createDependencies(null);

    await expect(loginWithEmail(dependencies, { email: "user@example.com", password: "password" })).resolves.toBeNull();
  });

  it("propagates provider failures", async () => {
    const authProvider = createProvider(null);
    vi.mocked(authProvider.loginWithEmail).mockRejectedValue(new Error("auth unavailable"));

    await expect(loginWithEmail({ authProvider, userRepositoryFor: vi.fn() }, { email: "user@example.com", password: "password" })).rejects.toThrow("auth unavailable");
  });

  it("surfaces the authenticator result unchanged", async () => {
    const { dependencies } = createDependencies(null);

    await expect(authenticateAndSync(dependencies, async () => ({ user: authUser, session }))).resolves.toMatchObject({ user: authUser });
    expect(dependencies.userRepositoryFor).toHaveBeenCalledWith(session);
  });

  it("resends confirmation email through the provider", async () => {
    const authProvider = createProvider(null);

    await resendConfirmationEmail(authProvider, { email: "user@example.com" });

    expect(authProvider.resendConfirmationEmail).toHaveBeenCalledWith({ email: "user@example.com" });
  });
});
