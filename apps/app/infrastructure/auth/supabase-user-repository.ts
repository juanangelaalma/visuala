import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile } from "@/domain/auth/types";
import type { UpsertUserProfileInput, UserRepository } from "@/domain/auth/user-repository";
import type { Database } from "@/infrastructure/supabase/database.types";

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase.from("profiles").select("*").eq("id", id).maybeSingle();

    if (error) throw error;
    return data ? mapProfile(data) : null;
  }

  async upsert(input: UpsertUserProfileInput): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .upsert(
        {
          id: input.id,
          email: input.email,
          full_name: input.fullName ?? null,
          avatar_url: input.avatarUrl ?? null,
          ...(input.role ? { role: input.role } : {}),
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error) throw error;
    return mapProfile(data);
  }
}

function mapProfile(row: Database["public"]["Tables"]["profiles"]["Row"]): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
