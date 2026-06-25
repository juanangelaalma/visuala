import type { AuthProvider } from "@/domain/auth/auth-provider";

export async function getCurrentUser(authProvider: AuthProvider) {
  return authProvider.getCurrentUser();
}
