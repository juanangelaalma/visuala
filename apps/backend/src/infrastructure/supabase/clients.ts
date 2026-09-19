import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readEnv } from "@/env";
import type { Database } from "@visuala/db";

export type BackendSupabaseClient = SupabaseClient<Database>;

export function createSupabasePublicClient(environment: Record<string, string | undefined> = process.env): BackendSupabaseClient {
  const env = readEnv(environment);

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseUserClient(accessToken: string, environment: Record<string, string | undefined> = process.env): BackendSupabaseClient {
  const env = readEnv(environment);

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createSupabaseServiceRoleClient(environment: Record<string, string | undefined> = process.env): BackendSupabaseClient {
  const env = readEnv(environment);

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
