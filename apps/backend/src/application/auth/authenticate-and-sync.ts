import type { AuthProvider, AuthResult, AuthSessionTokens } from "@/domain/auth/auth-provider";
import type { UserProfile } from "@/domain/auth/types";
import type { UserRepository } from "@/domain/auth/user-repository";
import { ensureUserProfile } from "./ensure-user-profile";

export type AuthenticatedUser = {
  user: AuthResult["user"];
  profile: UserProfile | null;
  session: AuthSessionTokens | null;
};

export type AuthenticateAndSyncDependencies = {
  authProvider: AuthProvider;
  userRepositoryFor: (session: AuthSessionTokens | null) => UserRepository;
};

export async function authenticateAndSync(dependencies: AuthenticateAndSyncDependencies, authenticate: () => Promise<AuthResult | null>): Promise<AuthenticatedUser | null> {
  const result = await authenticate();
  if (!result) return null;

  // Without a session the freshly created identity has no authenticated context yet
  // (email confirmation pending), so the profile row is synced on the first successful sign in instead.
  const profile = result.session ? await ensureUserProfile(dependencies.userRepositoryFor(result.session), result.user) : null;

  return { user: result.user, profile, session: result.session };
}
