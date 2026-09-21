import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateRenderJobInput, VideoRenderJobRepository } from "../../domain/video/contracts";
import type { VideoRenderJob } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type RenderJobRow = Database["public"]["Tables"]["video_render_jobs"]["Row"];

/**
 * The statuses the partial unique index `video_render_jobs_active_project_idx` treats as an
 * in-flight render; they mirror `isRenderJobActive` in the domain.
 */
const ACTIVE_RENDER_JOB_STATUSES = ["queued", "preparing", "rendering", "uploading"] as const;

/**
 * `getById`, `begin`, and `fail` deliberately take no owner: the render worker is server-side and
 * has no session. Every other read here filters on `user_id` in the query itself, so a route can
 * never widen its scope by forgetting a check.
 */
export class SupabaseRenderJobRepository implements VideoRenderJobRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateRenderJobInput): Promise<VideoRenderJob> {
    const { data, error } = await this.supabase.from("video_render_jobs").insert({
      id: input.id,
      project_id: input.projectId,
      user_id: input.userId,
      idempotency_key: input.idempotencyKey,
      brief_revision_id: input.briefRevisionId,
      storyboard_revision_id: input.storyboardRevisionId,
      parent_version_id: input.parentVersionId ?? null,
      is_revision: input.isRevision,
      input_snapshot: input.inputSnapshot,
    }).select("*").single();
    if (error) throw error;
    return mapRenderJob(data);
  }

  async getOwned(jobId: string, userId: string): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("id", jobId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async getById(jobId: string): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("id", jobId).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async findByIdempotencyKey(projectId: string, userId: string, idempotencyKey: string): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("project_id", projectId).eq("user_id", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async findActiveForProject(projectId: string, userId: string): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .in("status", [...ACTIVE_RENDER_JOB_STATUSES])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  /**
   * `attempts` is incremented by reading the row first, because the counter is `attempts + 1` and
   * the update cannot express that. The conditional `status = 'queued'` filter is what actually
   * claims the job: two workers that race both saw `queued`, and only one update can match it.
   */
  async begin(jobId: string): Promise<VideoRenderJob | null> {
    const current = await this.getById(jobId);
    if (!current || current.status !== "queued") return null;

    const { data, error } = await this.supabase.from("video_render_jobs")
      .update({
        status: "preparing",
        attempts: current.attempts + 1,
        started_at: current.startedAt ?? new Date().toISOString(),
      })
      .eq("id", jobId).eq("status", "queued")
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async fail(jobId: string, errorCode: string): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs")
      .update({ status: "failed", error_code: errorCode, finished_at: new Date().toISOString() })
      .eq("id", jobId)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  /** Cancellation is owner-qualified and only matches a job that is still `queued`. */
  async cancel(jobId: string, userId: string): Promise<VideoRenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId).eq("status", "queued")
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }
}

export function mapRenderJob(row: RenderJobRow): VideoRenderJob {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    briefRevisionId: row.brief_revision_id,
    storyboardRevisionId: row.storyboard_revision_id,
    ...(row.parent_version_id ? { parentVersionId: row.parent_version_id } : {}),
    isRevision: row.is_revision,
    inputSnapshot: row.input_snapshot,
    status: row.status,
    attempts: row.attempts,
    queuedAt: row.queued_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
