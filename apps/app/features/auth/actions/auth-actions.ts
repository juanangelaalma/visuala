"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthUser, UserProfile } from "@/domain/auth/types";
import { createSupabaseWritableServerClient } from "@/infrastructure/supabase/server-client";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { getRoleRedirectPath, getSafeAuthRedirect } from "@/lib/auth/redirects";
import { emailSchema, loginSchema, registerSchema } from "../schemas/auth-schemas";

export type AuthActionState = {
  error?: string;
  message?: string;
};

type AuthApiResponse = {
  user: AuthUser | null;
  profile: UserProfile | null;
  session: { accessToken: string; refreshToken: string } | null;
};

const AUTH_REDIRECT_COOKIE = "visuala_auth_redirect";
const GENERIC_ERROR = "Something went wrong. Please try again.";

export async function registerAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };

  try {
    await apiFetch<AuthApiResponse>("/auth/register", { method: "POST", body: parsed.data });
  } catch (error) {
    return { error: apiErrorMessage(error, GENERIC_ERROR) };
  }

  redirect(`/register/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function loginAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };

  let redirectPath = "/dashboard";

  try {
    const result = await apiFetch<AuthApiResponse>("/auth/login", { method: "POST", body: parsed.data });

    if (result.session) {
      const supabase = await createSupabaseWritableServerClient();
      await supabase.auth.setSession({ access_token: result.session.accessToken, refresh_token: result.session.refreshToken });
    }

    redirectPath = getSafeAuthRedirect(formData.get("next")) ?? getRoleRedirectPath(result.profile?.role);
  } catch (error) {
    return { error: apiErrorMessage(error, GENERIC_ERROR) };
  }

  redirect(redirectPath);
}

export async function resendConfirmationAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please enter a valid email address." };

  try {
    const { message } = await apiFetch<{ message: string }>("/auth/resend-confirmation", { method: "POST", body: parsed.data });

    return { message };
  } catch (error) {
    return { error: apiErrorMessage(error, GENERIC_ERROR) };
  }
}

export async function googleLoginAction(formData: FormData) {
  let url: string;

  try {
    const result = await apiFetch<{ url: string }>("/auth/oauth/google", { method: "POST" });
    url = result.url;
    const redirectPath = getSafeAuthRedirect(formData.get("next"));

    if (redirectPath) {
      const cookieStore = await cookies();
      cookieStore.set(AUTH_REDIRECT_COOKIE, redirectPath, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    }
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent(apiErrorMessage(error, "Could not start Google sign in."))}`);
  }

  redirect(url);
}

export async function logoutAction() {
  // Session cookies are owned by Next, so signing out here both revokes the session and clears them.
  const supabase = await createSupabaseWritableServerClient();
  await supabase.auth.signOut();

  redirect("/login");
}
