import type { UserProfile, UserRole } from "./types";

export type UpsertUserProfileInput = {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  role?: UserRole;
};

export interface UserRepository {
  findById(id: string): Promise<UserProfile | null>;
  upsert(input: UpsertUserProfileInput): Promise<UserProfile>;
}
