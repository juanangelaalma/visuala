import type { AuthProvider, ResendConfirmationEmailInput } from "@/domain/auth/auth-provider";

export async function resendConfirmationEmail(authProvider: AuthProvider, input: ResendConfirmationEmailInput) {
  await authProvider.resendConfirmationEmail(input);
}
