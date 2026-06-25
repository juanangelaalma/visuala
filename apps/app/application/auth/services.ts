import { SupabaseAuthAdapter } from "@/infrastructure/auth/supabase-auth-adapter";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

export async function createAuthServices() {
  const supabase = await createSupabaseServerClient();

  return {
    authProvider: new SupabaseAuthAdapter(supabase),
    userRepository: new SupabaseUserRepository(supabase),
  };
}
