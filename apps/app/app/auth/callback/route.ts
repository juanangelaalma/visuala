import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseWritableServerClient } from "@/infrastructure/supabase/server-client";
import { apiFetch } from "@/lib/api/client";
import { getRoleRedirectPath, getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getAppEnv } from "@/shared/config/env";

const AUTH_REDIRECT_COOKIE = "visuala_auth_redirect";

type SyncProfileResponse = {
  profile: { role?: string } | null;
};

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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent("Could not complete Google sign in.")}`);
  }

  // The freshly issued session is not readable from the cookie jar yet within this request, so it is passed explicitly.
  let profile: SyncProfileResponse["profile"] = null;
  try {
    ({ profile } = await apiFetch<SyncProfileResponse>("/auth/sync-profile", { method: "POST", accessToken: data.session.access_token }));
  } catch (syncError) {
    console.error("Failed to sync profile after OAuth callback", syncError);
  }

  const cookieStore = await cookies();
  const redirectPath = getSafeAuthRedirect(cookieStore.get(AUTH_REDIRECT_COOKIE)?.value) ?? getRoleRedirectPath(profile?.role);
  const response = NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}${redirectPath}`);
  response.cookies.delete(AUTH_REDIRECT_COOKIE);

  return response;
}
