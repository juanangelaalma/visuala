import type { AuthProvider } from "@/domain/auth/auth-provider";

export async function logout(authProvider: AuthProvider) {
  await authProvider.logout();
}
