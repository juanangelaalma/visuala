import { redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";

export default async function RootRedirectPage() {
  const { authProvider } = await createAuthServices();
  const user = await getCurrentUser(authProvider);

  if (user) redirect("/dashboard");

  redirect("/login");
}
