import type { User } from "@supabase/supabase-js";
import type { AuthUser } from "@/domain/auth/types";

export function toAuthUser(user: User): AuthUser | null {
  if (!user.email) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null,
    avatarUrl: typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null,
  };
}
