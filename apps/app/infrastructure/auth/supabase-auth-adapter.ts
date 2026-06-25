import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, LoginWithEmailInput, OAuthSignInInput, RegisterWithEmailInput } from "@/domain/auth/auth-provider";
import { AuthDomainError } from "@/domain/auth/errors";
import type { AuthUser } from "@/domain/auth/types";
import type { Database } from "@/infrastructure/supabase/database.types";

export class SupabaseAuthAdapter implements AuthProvider {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async registerWithEmail(input: RegisterWithEmailInput) {
    const { error } = await this.supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName ?? null },
      },
    });

    if (error) throw mapSupabaseAuthError(error.message);
  }

  async loginWithEmail(input: LoginWithEmailInput) {
    const { error } = await this.supabase.auth.signInWithPassword(input);

    if (error) throw mapSupabaseAuthError(error.message);
  }

  async loginWithOAuth(input: OAuthSignInInput) {
    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: input.provider,
      options: { redirectTo: input.redirectTo },
    });

    if (error) throw new AuthDomainError("oauth_error", "Could not start Google sign in. Please try again.");
    if (!data.url) throw new AuthDomainError("oauth_error", "Could not start Google sign in. Please try again.");

    return data.url;
  }

  async logout() {
    const { error } = await this.supabase.auth.signOut();

    if (error) throw new AuthDomainError("server_error", "Could not sign out. Please try again.");
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data, error } = await this.supabase.auth.getUser();

    if (error || !data.user?.email) return null;

    return {
      id: data.user.id,
      email: data.user.email,
      fullName: typeof data.user.user_metadata.full_name === "string" ? data.user.user_metadata.full_name : null,
      avatarUrl: typeof data.user.user_metadata.avatar_url === "string" ? data.user.user_metadata.avatar_url : null,
    };
  }
}

function mapSupabaseAuthError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login") || normalizedMessage.includes("invalid credentials")) {
    return new AuthDomainError("invalid_credentials", "Invalid email or password.");
  }

  if (normalizedMessage.includes("already registered") || normalizedMessage.includes("already exists")) {
    return new AuthDomainError("email_already_registered", "This email is already registered.");
  }

  return new AuthDomainError("server_error", "Authentication failed. Please try again.");
}
