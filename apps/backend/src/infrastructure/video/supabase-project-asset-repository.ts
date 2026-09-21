import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectAsset } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type ProjectAssetRow = Database["public"]["Tables"]["video_project_assets"]["Row"];

/**
 * Only the two operations Task 9 needs are implemented here; Task 10 completes the repository
 * (and adds `implements ProjectAssetRepository`) once asset upload exists.
 */
export class SupabaseProjectAssetRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listOwned(projectId: string, userId: string): Promise<ProjectAsset[]> {
    const { data, error } = await this.supabase.from("video_project_assets").select("*")
      .eq("project_id", projectId).eq("user_id", userId).is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapProjectAsset);
  }

  async softDelete(assetId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.from("video_project_assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", assetId).eq("user_id", userId).is("deleted_at", null);
    if (error) throw error;
  }
}

export function mapProjectAsset(row: ProjectAssetRow): ProjectAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    rightsConfirmedAt: row.rights_confirmed_at,
    moderationStatus: row.moderation_status,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    createdAt: row.created_at,
  };
}
