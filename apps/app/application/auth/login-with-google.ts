import type { AuthProvider } from "@/domain/auth/auth-provider";

export async function loginWithGoogle(authProvider: AuthProvider, redirectTo: string) {
  return authProvider.loginWithOAuth({ provider: "google", redirectTo });
}
