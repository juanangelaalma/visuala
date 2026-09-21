import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoMessageRepository } from "../../domain/video/contracts";
import type { VideoMessage } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type VideoMessageRow = Database["public"]["Tables"]["video_messages"]["Row"];

export class SupabaseVideoMessageRepository implements VideoMessageRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /** The row's `created_at` is the database clock; the client never supplies one. */
  async append(input: { id: string; projectId: string; userId: string; role: "user" | "assistant"; content: string; controls?: unknown; assetIds?: string[] }): Promise<VideoMessage> {
    const { data, error } = await this.supabase.from("video_messages").insert({
      id: input.id,
      project_id: input.projectId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      controls: input.controls ?? null,
      asset_ids: input.assetIds ?? [],
    }).select("*").single();
    if (error) throw error;
    return mapVideoMessage(data);
  }

  async listOwned(projectId: string, userId: string): Promise<VideoMessage[]> {
    const { data, error } = await this.supabase.from("video_messages").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapVideoMessage);
  }
}

export function mapVideoMessage(row: VideoMessageRow): VideoMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    controls: row.controls,
    assetIds: row.asset_ids,
    createdAt: row.created_at,
  };
}
