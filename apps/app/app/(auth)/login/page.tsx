import { redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";
import { googleLoginAction, loginAction } from "@/features/auth/actions/auth-actions";
import { AuthForm } from "@/features/auth/components/AuthForm";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ error }, { authProvider }] = await Promise.all([searchParams, createAuthServices()]);
  const user = await getCurrentUser(authProvider);

  if (user) redirect("/dashboard");

  return <AuthForm mode="login" action={loginAction} googleAction={googleLoginAction} initialError={error} />;
}
