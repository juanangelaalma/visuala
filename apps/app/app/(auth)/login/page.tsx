import { redirect } from "next/navigation";
import { googleLoginAction, loginAction } from "@/features/auth/actions/auth-actions";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSessionContext } from "@/lib/auth/session";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ error, next }, session] = await Promise.all([searchParams, getSessionContext()]);
  const redirectPath = getSafeAuthRedirect(next);

  if (session) redirect(redirectPath ?? "/dashboard");

  return <AuthForm mode="login" action={loginAction} googleAction={googleLoginAction} initialError={error} redirectPath={redirectPath ?? undefined} />;
}
