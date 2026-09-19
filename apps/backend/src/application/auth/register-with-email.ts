import type { RegisterWithEmailInput } from "@/domain/auth/auth-provider";
import { authenticateAndSync, type AuthenticateAndSyncDependencies, type AuthenticatedUser } from "./authenticate-and-sync";

export async function registerWithEmail(dependencies: AuthenticateAndSyncDependencies, input: RegisterWithEmailInput): Promise<AuthenticatedUser | null> {
  return authenticateAndSync(dependencies, () => dependencies.authProvider.registerWithEmail(input));
}
