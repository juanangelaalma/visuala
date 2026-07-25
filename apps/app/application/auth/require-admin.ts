import { redirect } from "next/navigation";
import { getCurrentUser } from "./get-current-user";
import { createAuthServices } from "./services";

export async function requireAdmin() {
  const { authProvider, userRepository } = await createAuthServices();
  const user = await getCurrentUser(authProvider);

  if (!user) redirect("/login");

  const profile = await userRepository.findById(user.id);

  if (profile?.role !== "admin") redirect("/dashboard");

  return profile;
}
