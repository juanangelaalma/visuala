import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateProjectAssetInput, ProjectAssetRepository } from "../../domain/video/contracts";
import type { ProjectAsset } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type ProjectAssetRow = Database["public"]["Tables"]["video_project_assets"]["Row"];

export class SupabaseProjectAssetRepository implements ProjectAssetRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * `moderation_status` is deliberately absent: it stays at the database default (`pending`) so a
   * caller can never declare its own asset approved.
   */
  async create(input: CreateProjectAssetInput): Promise<ProjectAsset> {
    const { data, error } = await this.supabase.from("video_project_assets").insert({
      id: input.id,
      project_id: input.projectId,
      user_id: input.userId,
      object_key: input.objectKey,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      sha256: input.sha256,
      width: input.width,
      height: input.height,
      rights_confirmed_at: input.rightsConfirmedAt,
    }).select("*").single();
    if (error) throw error;
    return mapProjectAsset(data);
  }

  async getOwned(assetId: string, userId: string): Promise<ProjectAsset | null> {
    const { data, error } = await this.supabase.from("video_project_assets").select("*")
      .eq("id", assetId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return data ? mapProjectAsset(data) : null;
  }

  async listOwned(projectId: string, userId: string): Promise<ProjectAsset[]> {
    const { data, error } = await this.supabase.from("video_project_assets").select("*")
      .eq("project_id", projectId).eq("user_id", userId).is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapProjectAsset);
  }

  /** The per-project byte ceiling is only meaningful over the rows that are still active. */
  async sumActiveBytes(projectId: string, userId: string): Promise<number> {
    const { data, error } = await this.supabase.from("video_project_assets").select("byte_size")
      .eq("project_id", projectId).eq("user_id", userId).is("deleted_at", null);
    if (error) throw error;
    return (data ?? []).reduce((total, row) => total + row.byte_size, 0);
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
