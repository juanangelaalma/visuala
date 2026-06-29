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

export interface AuthProvider {
  registerWithEmail(input: RegisterWithEmailInput): Promise<void>;
  loginWithEmail(input: LoginWithEmailInput): Promise<void>;
  resendConfirmationEmail(input: ResendConfirmationEmailInput): Promise<void>;
  loginWithOAuth(input: OAuthSignInInput): Promise<string>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<import("./types").AuthUser | null>;
}
