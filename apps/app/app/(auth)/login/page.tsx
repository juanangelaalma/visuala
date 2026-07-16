import { redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { getSafeAuthRedirect } from "@/application/auth/get-safe-auth-redirect";
import { createAuthServices } from "@/application/auth/services";
import { googleLoginAction, loginAction } from "@/features/auth/actions/auth-actions";
import { AuthForm } from "@/features/auth/components/AuthForm";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ error, next }, { authProvider }] = await Promise.all([searchParams, createAuthServices()]);
  const redirectPath = getSafeAuthRedirect(next);
  const user = await getCurrentUser(authProvider);

  if (user) redirect(redirectPath ?? "/dashboard");

  return <AuthForm mode="login" action={loginAction} googleAction={googleLoginAction} initialError={error} redirectPath={redirectPath ?? undefined} />;
}
