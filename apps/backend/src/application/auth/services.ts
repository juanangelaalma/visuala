import { SupabaseAuthAdapter } from "@/infrastructure/auth/supabase-auth-adapter";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { createSupabasePublicClient, createSupabaseUserClient } from "@/infrastructure/supabase/clients";
import type { AuthSessionTokens } from "@/domain/auth/auth-provider";

export function createAuthServices() {
  return {
    authProvider: new SupabaseAuthAdapter(createSupabasePublicClient()),
    userRepositoryFor: (session: AuthSessionTokens | null) => new SupabaseUserRepository(session ? createSupabaseUserClient(session.accessToken) : createSupabasePublicClient()),
  };
}
