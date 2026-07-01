import type { AuthProvider } from "@/domain/auth/auth-provider";
import type { UserProfile } from "@/domain/auth/types";
import type { UserRepository } from "@/domain/auth/user-repository";
import { ensureUserProfile } from "./ensure-user-profile";

export async function authenticateAndSync(authProvider: AuthProvider, userRepository: UserRepository, authenticate: () => Promise<void>): Promise<UserProfile | null> {
  await authenticate();
  const user = await authProvider.getCurrentUser();

  if (!user) return null;

  return ensureUserProfile(userRepository, user);
}
