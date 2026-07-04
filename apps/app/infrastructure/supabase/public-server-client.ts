import { createClient } from "@supabase/supabase-js";
import { getAppEnv } from "@/shared/config/env";
import type { Database } from "./database.types";

export function createSupabasePublicServerClient() {
  const env = getAppEnv();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
