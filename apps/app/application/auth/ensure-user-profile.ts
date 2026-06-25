import type { AuthUser } from "@/domain/auth/types";
import type { UserRepository } from "@/domain/auth/user-repository";

export async function ensureUserProfile(userRepository: UserRepository, user: AuthUser) {
  return userRepository.upsert({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
  });
}
