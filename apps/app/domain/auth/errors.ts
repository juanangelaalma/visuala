export type AuthErrorCode =
  | "invalid_credentials"
  | "email_already_registered"
  | "email_not_confirmed"
  | "rate_limited"
  | "oauth_error"
  | "validation_error"
  | "session_expired"
  | "server_error";

export class AuthDomainError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthDomainError";
  }
}

export function toFriendlyAuthError(error: unknown) {
  if (error instanceof AuthDomainError) return error.message;
  return "Something went wrong. Please try again.";
}
