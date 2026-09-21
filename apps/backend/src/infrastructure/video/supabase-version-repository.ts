import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoVersion } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type VideoVersionRow = Database["public"]["Tables"]["video_versions"]["Row"];

/**
 * Only the operation Task 9 needs is implemented here; Task 13 completes the repository (and adds
 * `implements VideoVersionRepository`) once rendering produces versions.
 */
export class SupabaseVideoVersionRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listOwned(projectId: string, userId: string): Promise<VideoVersion[]> {
    const { data, error } = await this.supabase.from("video_versions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version_number", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapVersion);
  }
}

export function mapVersion(row: VideoVersionRow): VideoVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    versionNumber: row.version_number,
    renderJobId: row.render_job_id,
    ...(row.parent_version_id ? { parentVersionId: row.parent_version_id } : {}),
    outputObjectKey: row.output_object_key,
    durationSeconds: row.duration_seconds,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    manifestHash: row.manifest_hash,
    createdAt: row.created_at,
  };
}
