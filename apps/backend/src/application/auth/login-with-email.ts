import type { LoginWithEmailInput } from "@/domain/auth/auth-provider";
import { authenticateAndSync, type AuthenticateAndSyncDependencies, type AuthenticatedUser } from "./authenticate-and-sync";

export async function loginWithEmail(dependencies: AuthenticateAndSyncDependencies, input: LoginWithEmailInput): Promise<AuthenticatedUser | null> {
  return authenticateAndSync(dependencies, () => dependencies.authProvider.loginWithEmail(input));
}
