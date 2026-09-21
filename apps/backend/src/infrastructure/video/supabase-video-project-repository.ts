import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_RERENDERS_PER_PROJECT } from "../../domain/video/limits";
import { assertVideoProjectTransition } from "../../domain/video/state-machine";
import type { CreateVideoProjectInput, VideoProjectRepository } from "../../domain/video/contracts";
import type { VideoProject, VideoProjectStatus, VideoStyleId } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type ProjectRow = Database["public"]["Tables"]["video_projects"]["Row"];

export class SupabaseVideoProjectRepository implements VideoProjectRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateVideoProjectInput): Promise<VideoProject> {
    const { data, error } = await this.supabase.from("video_projects").insert({
      id: input.id,
      user_id: input.userId,
      title: input.title,
      video_type: input.videoType,
      style_id: input.styleId,
      duration_seconds: input.settings.durationSeconds,
      aspect_ratio: input.settings.aspectRatio,
      resolution: input.settings.resolution,
      language: input.settings.language,
      voice_over_enabled: input.settings.voiceOverEnabled,
      music_enabled: input.settings.musicEnabled,
    }).select("*").single();
    if (error) throw error;
    return mapProject(data);
  }

  async getOwned(projectId: string, userId: string): Promise<VideoProject | null> {
    const { data, error } = await this.supabase.from("video_projects").select("*")
      .eq("id", projectId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async getOwnedIncludingDeleted(projectId: string, userId: string): Promise<VideoProject | null> {
    const { data, error } = await this.supabase.from("video_projects").select("*")
      .eq("id", projectId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async listOwned(userId: string): Promise<VideoProject[]> {
    const { data, error } = await this.supabase.from("video_projects").select("*")
      .eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapProject);
  }

  async softDelete(projectId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.from("video_projects")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", projectId).eq("user_id", userId).is("deleted_at", null);
    if (error) throw error;
  }

  async transition(projectId: string, userId: string, expectedStatus: VideoProjectStatus, nextStatus: VideoProjectStatus): Promise<VideoProject | null> {
    // The transition graph is enforced here, before the update is issued: an illegal edge throws
    // `video_state_conflict` instead of ever reaching Postgres. The conditional `status = expected`
    // filter below stays the concurrency guard; this check is additive, not a replacement.
    assertVideoProjectTransition(expectedStatus, nextStatus);
    const { data, error } = await this.supabase.from("video_projects")
      .update({ status: nextStatus })
      .eq("id", projectId).eq("user_id", userId).eq("status", expectedStatus)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async updateStyle(projectId: string, userId: string, styleId: VideoStyleId): Promise<VideoProject | null> {
    const { data, error } = await this.supabase.from("video_projects")
      .update({ style_id: styleId })
      .eq("id", projectId).eq("user_id", userId)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }

  async consumeRerender(projectId: string, userId: string): Promise<VideoProject | null> {
    const current = await this.getOwned(projectId, userId);
    if (!current || current.revisionRenderCount >= MAX_RERENDERS_PER_PROJECT) return null;
    const { data, error } = await this.supabase.from("video_projects")
      .update({ revision_render_count: current.revisionRenderCount + 1 })
      .eq("id", projectId).eq("user_id", userId).lt("revision_render_count", MAX_RERENDERS_PER_PROJECT)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  }
}

export function mapProject(row: ProjectRow): VideoProject {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    videoType: row.video_type,
    styleId: row.style_id,
    status: row.status,
    settings: {
      durationSeconds: row.duration_seconds,
      aspectRatio: row.aspect_ratio,
      resolution: row.resolution,
      language: row.language,
      voiceOverEnabled: row.voice_over_enabled,
      musicEnabled: row.music_enabled,
    },
    revisionRenderCount: row.revision_render_count,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
