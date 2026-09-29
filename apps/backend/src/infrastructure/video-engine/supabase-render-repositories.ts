import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateRenderJobInput,
  CreateVideoVersionInput,
  EngineRenderJobStatus,
  OutputKind,
  RenderJob,
  RenderJobRepository,
  VideoVersion,
  VideoVersionRepository,
} from "../../domain/video-engine/contracts";
import { ACTIVE_ENGINE_RENDER_JOB_STATUSES } from "../../domain/video-engine/contracts";
import type { Database } from "@visuala/db";

type RenderJobRow = Database["public"]["Tables"]["video_render_jobs"]["Row"];
type VersionRow = Database["public"]["Tables"]["video_versions"]["Row"];

export class SupabaseRenderJobRepository implements RenderJobRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateRenderJobInput): Promise<RenderJob> {
    const { data, error } = await this.supabase.from("video_render_jobs").insert({
      id: input.id,
      project_id: input.projectId,
      user_id: input.userId,
      idempotency_key: input.idempotencyKey,
      composition_artifact_id: input.compositionArtifactId,
      kind: input.kind,
      parent_version_id: input.parentVersionId ?? null,
      is_revision: input.isRevision,
      input_snapshot: input.inputSnapshot,
    }).select("*").single();
    if (error) throw error;
    return mapRenderJob(data);
  }

  async getOwned(jobId: string, userId: string): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("id", jobId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async getById(jobId: string): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("id", jobId).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async findByIdempotencyKey(projectId: string, userId: string, idempotencyKey: string): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("project_id", projectId).eq("user_id", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async findActiveForProject(projectId: string, userId: string): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .in("status", [...ACTIVE_ENGINE_RENDER_JOB_STATUSES])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  /** The conditional `status = 'queued'` filter is the claim: two workers that raced both saw queued, and one update matches. */
  async begin(jobId: string): Promise<RenderJob | null> {
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

  async fail(jobId: string, errorCode: string): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs")
      .update({ status: "failed", error_code: errorCode, finished_at: new Date().toISOString() })
      .eq("id", jobId)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async cancel(jobId: string, userId: string): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId).eq("status", "queued")
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async latestOwned(projectId: string, userId: string): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }

  async listQueued(limit: number): Promise<RenderJob[]> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .eq("status", "queued").order("queued_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRenderJob);
  }

  /** The `started_at is not null` filter keeps a job that has never started out of the reclaimer's reach. */
  async listStale(startedBefore: string, limit: number): Promise<RenderJob[]> {
    const { data, error } = await this.supabase.from("video_render_jobs").select("*")
      .in("status", [...ACTIVE_ENGINE_RENDER_JOB_STATUSES])
      .not("started_at", "is", null)
      .lt("started_at", startedBefore)
      .order("started_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRenderJob);
  }

  markRendering(jobId: string): Promise<RenderJob | null> {
    return this.advance(jobId, "preparing", "rendering");
  }

  markUploading(jobId: string): Promise<RenderJob | null> {
    return this.advance(jobId, "rendering", "uploading");
  }

  succeed(jobId: string): Promise<RenderJob | null> {
    return this.advance(jobId, "uploading", "succeeded", { finished_at: new Date().toISOString() });
  }

  /** The prior status is part of the update, so a job failed by the reclaimer cannot be resurrected by a stale worker. */
  private async advance(
    jobId: string,
    from: EngineRenderJobStatus,
    to: EngineRenderJobStatus,
    patch: Record<string, unknown> = {},
  ): Promise<RenderJob | null> {
    const { data, error } = await this.supabase.from("video_render_jobs")
      .update({ status: to, ...patch })
      .eq("id", jobId).eq("status", from)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRenderJob(data) : null;
  }
}

export class SupabaseVideoVersionRepository implements VideoVersionRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateVideoVersionInput): Promise<VideoVersion> {
    const { data, error } = await this.supabase.from("video_versions").insert({
      id: input.id,
      project_id: input.projectId,
      user_id: input.userId,
      version_number: input.versionNumber,
      render_job_id: input.renderJobId,
      parent_version_id: input.parentVersionId ?? null,
      output_object_key: input.outputObjectKey,
      kind: input.kind,
      duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      composition_hash: input.compositionHash,
    }).select("*").single();
    if (error) throw error;
    return mapVersion(data);
  }

  async getOwned(versionId: string, userId: string): Promise<VideoVersion | null> {
    const { data, error } = await this.supabase.from("video_versions").select("*")
      .eq("id", versionId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapVersion(data) : null;
  }

  /** Downloads exclude previews here rather than in the caller, so no route can leak a draft. */
  async listFinalOwned(projectId: string, userId: string): Promise<VideoVersion[]> {
    const { data, error } = await this.supabase.from("video_versions").select("*")
      .eq("project_id", projectId).eq("user_id", userId).eq("kind", "final")
      .order("version_number", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapVersion);
  }

  async latestOwned(projectId: string, userId: string, kind: OutputKind): Promise<VideoVersion | null> {
    const { data, error } = await this.supabase.from("video_versions").select("*")
      .eq("project_id", projectId).eq("user_id", userId).eq("kind", kind)
      .order("version_number", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapVersion(data) : null;
  }

  async nextVersionNumber(projectId: string): Promise<number> {
    const { data, error } = await this.supabase.from("video_versions").select("version_number")
      .eq("project_id", projectId).order("version_number", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return (data?.version_number ?? 0) + 1;
  }
}

export function mapRenderJob(row: RenderJobRow): RenderJob {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    compositionArtifactId: row.composition_artifact_id,
    kind: row.kind,
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

export function mapVersion(row: VersionRow): VideoVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    versionNumber: row.version_number,
    renderJobId: row.render_job_id,
    ...(row.parent_version_id ? { parentVersionId: row.parent_version_id } : {}),
    outputObjectKey: row.output_object_key,
    kind: row.kind,
    durationSeconds: row.duration_seconds,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    compositionHash: row.composition_hash,
    createdAt: row.created_at,
  };
}
