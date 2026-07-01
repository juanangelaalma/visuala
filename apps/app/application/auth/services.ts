import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAuthAdapter } from "@/infrastructure/auth/supabase-auth-adapter";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { createSupabaseServerClient, createSupabaseWritableServerClient } from "@/infrastructure/supabase/server-client";
import type { Database } from "@/infrastructure/supabase/database.types";

export async function createAuthServices() {
  const supabase = await createSupabaseServerClient();

  return createAuthServicesFromSupabase(supabase);
}

export async function createWritableAuthServices() {
  const supabase = await createSupabaseWritableServerClient();

  return createAuthServicesFromSupabase(supabase);
}

export function createAuthServicesFromSupabase(supabase: SupabaseClient<Database>) {
  return {
    authProvider: new SupabaseAuthAdapter(supabase),
    userRepository: new SupabaseUserRepository(supabase),
  };
}
