import { describe, expect, it, vi } from "vitest";
import type { AuthProvider } from "@/domain/auth/auth-provider";
import type { AuthUser, UserProfile } from "@/domain/auth/types";
import type { UserRepository } from "@/domain/auth/user-repository";
import { loginWithEmail } from "./login-with-email";
import { registerWithEmail } from "./register-with-email";
import { resendConfirmationEmail } from "./resend-confirmation-email";

function createAuthProvider(user: AuthUser | null = { id: "user-1", email: "user@example.com", fullName: "Jane Creator", avatarUrl: null }): AuthProvider {
  return {
    registerWithEmail: vi.fn().mockResolvedValue(undefined),
    loginWithEmail: vi.fn().mockResolvedValue(undefined),
    resendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    loginWithOAuth: vi.fn().mockResolvedValue("http://localhost/auth/callback"),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(user),
  };
}

function createUserRepository(): UserRepository {
  const profile: UserProfile = {
    id: "user-1",
    email: "user@example.com",
    fullName: "Jane Creator",
    avatarUrl: null,
    role: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  return {
    findById: vi.fn().mockResolvedValue(profile),
    upsert: vi.fn().mockResolvedValue(profile),
  };
}

describe("email auth use cases", () => {
  it("registers and ensures user profile", async () => {
    const authProvider = createAuthProvider();
    const userRepository = createUserRepository();

    await registerWithEmail(authProvider, userRepository, {
      email: "user@example.com",
      password: "password123",
      fullName: "Jane Creator",
    });

    expect(authProvider.registerWithEmail).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
      fullName: "Jane Creator",
    });
    expect(userRepository.upsert).toHaveBeenCalledWith({
      id: "user-1",
      email: "user@example.com",
      fullName: "Jane Creator",
      avatarUrl: null,
    });
  });

  it("logs in and ensures user profile", async () => {
    const authProvider = createAuthProvider();
    const userRepository = createUserRepository();

    await loginWithEmail(authProvider, userRepository, {
      email: "user@example.com",
      password: "password123",
    });

    expect(authProvider.loginWithEmail).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
    expect(userRepository.upsert).toHaveBeenCalledWith({
      id: "user-1",
      email: "user@example.com",
      fullName: "Jane Creator",
      avatarUrl: null,
    });
  });

  it("resends confirmation email", async () => {
    const authProvider = createAuthProvider();

    await resendConfirmationEmail(authProvider, { email: "user@example.com" });

    expect(authProvider.resendConfirmationEmail).toHaveBeenCalledWith({ email: "user@example.com" });
  });

  it("skips profile when current user is missing", async () => {
    const authProvider = createAuthProvider(null);
    const userRepository = createUserRepository();

    await loginWithEmail(authProvider, userRepository, {
      email: "user@example.com",
      password: "password123",
    });

    expect(userRepository.upsert).not.toHaveBeenCalled();
  });
});
