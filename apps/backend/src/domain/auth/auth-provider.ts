import type { AuthUser } from "./types";

export type RegisterWithEmailInput = {
  email: string;
  password: string;
  fullName?: string;
};

export type LoginWithEmailInput = {
  email: string;
  password: string;
};

export type ResendConfirmationEmailInput = {
  email: string;
};

export type OAuthProvider = "google";

export type OAuthSignInInput = {
  provider: OAuthProvider;
  redirectTo: string;
};

export type AuthSessionTokens = { accessToken: string; refreshToken: string };

export type AuthResult = { user: AuthUser; session: AuthSessionTokens | null };

export interface AuthProvider {
  registerWithEmail(input: RegisterWithEmailInput): Promise<AuthResult | null>;
  loginWithEmail(input: LoginWithEmailInput): Promise<AuthResult | null>;
  resendConfirmationEmail(input: ResendConfirmationEmailInput): Promise<void>;
  loginWithOAuth(input: OAuthSignInInput): Promise<string>;
}
