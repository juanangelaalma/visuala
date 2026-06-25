import type { UserProfile } from "./types";

export type UpsertUserProfileInput = {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
};

export interface UserRepository {
  findById(id: string): Promise<UserProfile | null>;
  upsert(input: UpsertUserProfileInput): Promise<UserProfile>;
}
