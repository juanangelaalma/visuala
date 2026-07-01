import { redirect } from "next/navigation";
import { createAuthServices } from "./services";

export async function requireAdmin() {
  const { authProvider, userRepository } = await createAuthServices();
  const user = await authProvider.getCurrentUser();

  if (!user) redirect("/login");

  const profile = await userRepository.findById(user.id);

  if (profile?.role !== "admin") redirect("/dashboard");

  return profile;
}
