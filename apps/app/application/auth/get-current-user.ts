import { cache } from "react";
import type { AuthProvider } from "@/domain/auth/auth-provider";

export const getCurrentUser = cache(async (authProvider: AuthProvider) => {
  return authProvider.getCurrentUser();
});
