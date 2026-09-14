import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIAsset, AssetRepository, CreateAssetInput } from "@/domain/ai-service/assets";
import type { Database } from "@/infrastructure/supabase/database.types";

type AssetRow = Database["public"]["Tables"]["ai_assets"]["Row"];

export class SupabaseAssetRepository implements AssetRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateAssetInput): Promise<AIAsset> {
    const { data, error } = await this.supabase.from("ai_assets").insert(mapInsert(input)).select("*").single();
    if (error) throw error;
    return mapAsset(data);
  }

  async getOwned(assetId: string, userId: string): Promise<AIAsset | null> {
    const { data, error } = await this.supabase.from("ai_assets").select("*").eq("id", assetId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapAsset(data) : null;
  }
}

function mapInsert(input: CreateAssetInput) {
  return {
    id: input.id, user_id: input.userId, object_key: input.objectKey, mime_type: input.mimeType,
    byte_size: input.byteSize, sha256: input.sha256, width: input.width, height: input.height, validated: true,
  };
}

function mapAsset(row: AssetRow): AIAsset {
  return {
    id: row.id, userId: row.user_id, objectKey: row.object_key, mimeType: row.mime_type,
    byteSize: row.byte_size, sha256: row.sha256, width: row.width, height: row.height, validated: row.validated,
    deletedAt: row.deleted_at ?? undefined, createdAt: row.created_at,
  };
}
