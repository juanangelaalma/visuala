import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/application/auth/ensure-user-profile";
import { SupabaseAuthAdapter } from "@/infrastructure/auth/supabase-auth-adapter";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { getAppEnv } from "@/shared/config/env";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const env = getAppEnv();

  if (providerError) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent("Google sign in was cancelled or failed.")}`);
  }

  if (!code) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent("Invalid auth callback.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent("Could not complete Google sign in.")}`);
  }

  const authProvider = new SupabaseAuthAdapter(supabase);
  const userRepository = new SupabaseUserRepository(supabase);
  const user = await authProvider.getCurrentUser();

  if (user) await ensureUserProfile(userRepository, user);

  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/dashboard`);
}
