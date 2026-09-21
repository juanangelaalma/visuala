import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateVideoVersionInput, VideoVersionRepository } from "../../domain/video/contracts";
import type { VideoVersion } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type VideoVersionRow = Database["public"]["Tables"]["video_versions"]["Row"];

/**
 * Versions are written by the render plan's worker once an MP4 is uploaded, and read by the API.
 * Every read is owner-qualified in the query, and the object key never leaves the repository as a
 * canonical reference: callers sign it per request instead.
 */
export class SupabaseVideoVersionRepository implements VideoVersionRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateVideoVersionInput): Promise<VideoVersion> {
    const { data, error } = await this.supabase.from("video_versions").insert({
      project_id: input.projectId,
      user_id: input.userId,
      version_number: input.versionNumber,
      render_job_id: input.renderJobId,
      parent_version_id: input.parentVersionId ?? null,
      output_object_key: input.outputObjectKey,
      duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      manifest_hash: input.manifestHash,
    }).select("*").single();
    if (error) throw error;
    return mapVersion(data);
  }

  async listOwned(projectId: string, userId: string): Promise<VideoVersion[]> {
    const { data, error } = await this.supabase.from("video_versions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version_number", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapVersion);
  }

  async getOwned(versionId: string, userId: string): Promise<VideoVersion | null> {
    const { data, error } = await this.supabase.from("video_versions").select("*")
      .eq("id", versionId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapVersion(data) : null;
  }

  async latestOwned(projectId: string, userId: string): Promise<VideoVersion | null> {
    const { data, error } = await this.supabase.from("video_versions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version_number", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapVersion(data) : null;
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
