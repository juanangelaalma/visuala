import { redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";
import { googleLoginAction, registerAction } from "@/features/auth/actions/auth-actions";
import { AuthForm } from "@/features/auth/components/AuthForm";

export default async function RegisterPage() {
  const { authProvider } = await createAuthServices();
  const user = await getCurrentUser(authProvider);

  if (user) redirect("/dashboard");

  return <AuthForm mode="register" action={registerAction} googleAction={googleLoginAction} />;
}
