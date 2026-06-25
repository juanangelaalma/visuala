import type { AuthProvider, LoginWithEmailInput } from "@/domain/auth/auth-provider";
import type { UserRepository } from "@/domain/auth/user-repository";
import { authenticateAndSync } from "./authenticate-and-sync";

export async function loginWithEmail(authProvider: AuthProvider, userRepository: UserRepository, input: LoginWithEmailInput) {
  await authenticateAndSync(authProvider, userRepository, () => authProvider.loginWithEmail(input));
}
