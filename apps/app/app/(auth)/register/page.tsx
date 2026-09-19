import { redirect } from "next/navigation";
import { googleLoginAction, registerAction } from "@/features/auth/actions/auth-actions";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { getSessionContext } from "@/lib/auth/session";

export default async function RegisterPage() {
  const session = await getSessionContext();

  if (session) redirect("/dashboard");

  return <AuthForm mode="register" action={registerAction} googleAction={googleLoginAction} />;
}
