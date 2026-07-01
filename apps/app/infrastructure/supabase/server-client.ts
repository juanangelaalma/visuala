import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAppEnv } from "@/shared/config/env";
import type { Database } from "./database.types";

type CookieWriteMode = "readonly" | "writable";

export async function createSupabaseServerClient() {
  return createSupabaseServerClientWithCookieMode("readonly");
}

export async function createSupabaseWritableServerClient() {
  return createSupabaseServerClientWithCookieMode("writable");
}

async function createSupabaseServerClientWithCookieMode(mode: CookieWriteMode) {
  const env = getAppEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (mode === "readonly") return;
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
