import type { AuthUser } from "@/domain/auth/types";
import type { UserRepository } from "@/domain/auth/user-repository";
import { isAdminEmail } from "./is-admin-email";

export async function ensureUserProfile(userRepository: UserRepository, user: AuthUser) {
  const existing = await userRepository.findById(user.id);

  return userRepository.upsert({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    ...(existing ? {} : { role: isAdminEmail(user.email) ? "admin" : "user" }),
  });
}
