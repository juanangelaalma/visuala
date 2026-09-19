import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, AuthResult, AuthSessionTokens, LoginWithEmailInput, OAuthSignInInput, RegisterWithEmailInput, ResendConfirmationEmailInput } from "@/domain/auth/auth-provider";
import { AuthDomainError } from "@/domain/auth/errors";
import { toAuthUser } from "@/infrastructure/auth/map-auth-user";
import type { Database } from "@visuala/db";

type SupabaseSession = { access_token?: string; refresh_token?: string } | null;

function toSessionTokens(session: SupabaseSession): AuthSessionTokens | null {
  if (!session?.access_token || !session.refresh_token) return null;

  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

export class SupabaseAuthAdapter implements AuthProvider {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async registerWithEmail(input: RegisterWithEmailInput): Promise<AuthResult | null> {
    const { data, error } = await this.supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName ?? null },
      },
    });

    if (error) throw mapSupabaseAuthError(error.message);

    const user = data.user ? toAuthUser(data.user) : null;
    return user ? { user, session: toSessionTokens(data.session) } : null;
  }

  async loginWithEmail(input: LoginWithEmailInput): Promise<AuthResult | null> {
    const { data, error } = await this.supabase.auth.signInWithPassword(input);

    if (error) throw mapSupabaseAuthError(error.message);

    const user = data.user ? toAuthUser(data.user) : null;
    return user ? { user, session: toSessionTokens(data.session) } : null;
  }

  async resendConfirmationEmail(input: ResendConfirmationEmailInput) {
    const { error } = await this.supabase.auth.resend({
      type: "signup",
      email: input.email,
    });

    if (error) throw mapSupabaseAuthError(error.message);
  }

  async loginWithOAuth(input: OAuthSignInInput): Promise<string> {
    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: input.provider,
      options: { redirectTo: input.redirectTo },
    });

    if (error) throw new AuthDomainError("oauth_error", "Could not start Google sign in. Please try again.");
    if (!data.url) throw new AuthDomainError("oauth_error", "Could not start Google sign in. Please try again.");

    return data.url;
  }
}

function mapSupabaseAuthError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("email not confirmed")) {
    return new AuthDomainError("email_not_confirmed", "Please confirm your email before logging in.");
  }

  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many") || normalizedMessage.includes("for security purposes")) {
    return new AuthDomainError("rate_limited", "Please wait a moment before requesting another confirmation email.");
  }

  if (normalizedMessage.includes("invalid login") || normalizedMessage.includes("invalid credentials")) {
    return new AuthDomainError("invalid_credentials", "Invalid email or password.");
  }

  if (normalizedMessage.includes("already registered") || normalizedMessage.includes("already exists")) {
    return new AuthDomainError("email_already_registered", "This email is already registered.");
  }

  return new AuthDomainError("server_error", "Authentication failed. Please try again.");
}
