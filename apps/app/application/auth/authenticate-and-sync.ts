import type { AuthProvider } from "@/domain/auth/auth-provider";
import type { UserRepository } from "@/domain/auth/user-repository";
import { ensureUserProfile } from "./ensure-user-profile";

export async function authenticateAndSync(authProvider: AuthProvider, userRepository: UserRepository, authenticate: () => Promise<void>) {
  await authenticate();
  const user = await authProvider.getCurrentUser();

  if (user) {
    await ensureUserProfile(userRepository, user);
  }
}
