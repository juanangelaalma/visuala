import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export default async function RootRedirectPage() {
  const session = await getSessionContext();

  if (session) redirect("/dashboard");

  redirect("/login");
}
