import type { AuthProvider, RegisterWithEmailInput } from "@/domain/auth/auth-provider";
import type { UserRepository } from "@/domain/auth/user-repository";
import { authenticateAndSync } from "./authenticate-and-sync";

export async function registerWithEmail(authProvider: AuthProvider, userRepository: UserRepository, input: RegisterWithEmailInput) {
  await authenticateAndSync(authProvider, userRepository, () => authProvider.registerWithEmail(input));
}
