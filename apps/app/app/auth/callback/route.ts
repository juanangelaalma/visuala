import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/application/auth/ensure-user-profile";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { getRoleRedirectPath } from "@/application/auth/get-role-redirect";
import { getSafeAuthRedirect } from "@/application/auth/get-safe-auth-redirect";
import { createAuthServicesFromSupabase } from "@/application/auth/services";
import { createSupabaseWritableServerClient } from "@/infrastructure/supabase/server-client";
import { getAppEnv } from "@/shared/config/env";

const AUTH_REDIRECT_COOKIE = "visuala_auth_redirect";

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

  const supabase = await createSupabaseWritableServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent("Could not complete Google sign in.")}`);
  }

  const { authProvider, userRepository } = createAuthServicesFromSupabase(supabase);
  const user = await getCurrentUser(authProvider);
  const profile = user ? await ensureUserProfile(userRepository, user) : null;
  const cookieStore = await cookies();
  const redirectPath = getSafeAuthRedirect(cookieStore.get(AUTH_REDIRECT_COOKIE)?.value) ?? getRoleRedirectPath(profile?.role);
  const response = NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}${redirectPath}`);
  response.cookies.delete(AUTH_REDIRECT_COOKIE);

  return response;
}
