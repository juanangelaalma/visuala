"use server";

import { redirect } from "next/navigation";
import { loginWithEmail } from "@/application/auth/login-with-email";
import { loginWithGoogle } from "@/application/auth/login-with-google";
import { logout } from "@/application/auth/logout";
import { registerWithEmail } from "@/application/auth/register-with-email";
import { resendConfirmationEmail } from "@/application/auth/resend-confirmation-email";
import { createAuthServices } from "@/application/auth/services";
import { AuthDomainError, toFriendlyAuthError } from "@/domain/auth/errors";
import { getAppEnv } from "@/shared/config/env";
import { emailSchema, loginSchema, registerSchema } from "../schemas/auth-schemas";

export type AuthActionState = {
  error?: string;
  message?: string;
};

export async function registerAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };

  try {
    const { authProvider, userRepository } = await createAuthServices();
    await registerWithEmail(authProvider, userRepository, parsed.data);
    await resendConfirmationEmail(authProvider, { email: parsed.data.email }).catch(() => undefined);
  } catch (error) {
    return { error: toFriendlyAuthError(error) };
  }

  redirect(`/register/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function loginAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };

  try {
    const { authProvider, userRepository } = await createAuthServices();
    await loginWithEmail(authProvider, userRepository, parsed.data);
  } catch (error) {
    return { error: toFriendlyAuthError(error) };
  }

  redirect("/dashboard");
}

export async function resendConfirmationAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please enter a valid email address." };

  try {
    const { authProvider } = await createAuthServices();
    await resendConfirmationEmail(authProvider, parsed.data);
  } catch (error) {
    if (error instanceof AuthDomainError && error.code === "rate_limited") return { error: error.message };
  }

  return { message: "If an account exists, we sent a confirmation email." };
}

export async function googleLoginAction() {
  let url: string;

  try {
    const { authProvider } = await createAuthServices();
    const env = getAppEnv();
    url = await loginWithGoogle(authProvider, `${env.NEXT_PUBLIC_APP_URL}/auth/callback`);
  } catch (error) {
    if (error instanceof AuthDomainError) redirect(`/login?error=${encodeURIComponent(error.message)}`);
    redirect("/login?error=Could%20not%20start%20Google%20sign%20in.");
  }

  redirect(url);
}

export async function logoutAction() {
  const { authProvider } = await createAuthServices();
  await logout(authProvider);
  redirect("/login");
}
