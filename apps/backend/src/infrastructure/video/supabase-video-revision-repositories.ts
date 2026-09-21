import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateBriefRevisionInput, CreateStoryboardRevisionInput, VideoBriefRevisionRepository, VideoStoryboardRevisionRepository,
} from "../../domain/video/contracts";
import { VIDEO_DURATIONS_SECONDS } from "../../domain/video/settings";
import type { GeneratedBy, VideoBriefRevision, VideoDurationSeconds, VideoStoryboardRevision } from "../../domain/video/types";
import type { Database } from "@visuala/db";

type BriefRevisionRow = Database["public"]["Tables"]["video_brief_revisions"]["Row"];
type StoryboardRevisionRow = Database["public"]["Tables"]["video_storyboard_revisions"]["Row"];

/**
 * Revision rows are append-only. The only column an update may ever touch on a brief revision is
 * `is_complete`, which is why there is no `update` here beyond that single-column write the
 * database grants.
 */
export class SupabaseVideoBriefRevisionRepository implements VideoBriefRevisionRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateBriefRevisionInput): Promise<VideoBriefRevision> {
    const first = await this.insertRow(input);
    if (!first.error) return mapBriefRevision(first.data);
    if (!isVersionConflict(first.error)) throw first.error;

    // The unique index on `(project_id, version)` is the real guard, so two writers that picked the
    // same version resolve here: the loser re-reads the maximum and retries once.
    const retry = await this.insertRow(input);
    if (retry.error) throw retry.error;
    return mapBriefRevision(retry.data);
  }

  async latestOwned(projectId: string, userId: string): Promise<VideoBriefRevision | null> {
    const { data, error } = await this.supabase.from("video_brief_revisions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapBriefRevision(data) : null;
  }

  async getOwned(revisionId: string, userId: string): Promise<VideoBriefRevision | null> {
    const { data, error } = await this.supabase.from("video_brief_revisions").select("*")
      .eq("id", revisionId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapBriefRevision(data) : null;
  }

  private async insertRow(input: CreateBriefRevisionInput) {
    const version = await this.nextVersion(input.projectId);
    return this.supabase.from("video_brief_revisions").insert({
      project_id: input.projectId,
      user_id: input.userId,
      version,
      schema_version: input.schemaVersion,
      brief: input.brief,
      is_complete: input.isComplete,
      generated_by: input.generatedBy,
      source_message_ids: input.sourceMessageIds,
    }).select("*").single();
  }

  private async nextVersion(projectId: string): Promise<number> {
    const { data, error } = await this.supabase.from("video_brief_revisions").select("version")
      .eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return (data?.version ?? 0) + 1;
  }
}

/**
 * Same append-only contract as the brief revisions. `approve` writes only `approved_at` and
 * `approval_snapshot`, the two columns the database grants to `service_role`; the row that records
 * what the user approved must stay byte-identical to what was validated.
 */
export class SupabaseVideoStoryboardRevisionRepository implements VideoStoryboardRevisionRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateStoryboardRevisionInput): Promise<VideoStoryboardRevision> {
    const first = await this.insertRow(input);
    if (!first.error) return mapStoryboardRevision(first.data);
    if (!isVersionConflict(first.error)) throw first.error;

    const retry = await this.insertRow(input);
    if (retry.error) throw retry.error;
    return mapStoryboardRevision(retry.data);
  }

  async latestOwned(projectId: string, userId: string): Promise<VideoStoryboardRevision | null> {
    const { data, error } = await this.supabase.from("video_storyboard_revisions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapStoryboardRevision(data) : null;
  }

  async getOwned(revisionId: string, userId: string): Promise<VideoStoryboardRevision | null> {
    const { data, error } = await this.supabase.from("video_storyboard_revisions").select("*")
      .eq("id", revisionId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapStoryboardRevision(data) : null;
  }

  async approve(revisionId: string, userId: string, approvedAt: string, approvalSnapshot: unknown): Promise<VideoStoryboardRevision | null> {
    const { data, error } = await this.supabase.from("video_storyboard_revisions")
      .update({ approved_at: approvedAt, approval_snapshot: approvalSnapshot })
      .eq("id", revisionId).eq("user_id", userId)
      .select("*").maybeSingle();
    if (error) throw error;
    return data ? mapStoryboardRevision(data) : null;
  }

  private async insertRow(input: CreateStoryboardRevisionInput) {
    const version = await this.nextVersion(input.projectId);
    return this.supabase.from("video_storyboard_revisions").insert({
      project_id: input.projectId,
      user_id: input.userId,
      version,
      schema_version: input.schemaVersion,
      brief_revision_id: input.briefRevisionId,
      scenes: input.scenes,
      total_duration_seconds: toStoredDuration(input.totalDurationSeconds),
      generated_by: input.generatedBy,
    }).select("*").single();
  }

  private async nextVersion(projectId: string): Promise<number> {
    const { data, error } = await this.supabase.from("video_storyboard_revisions").select("version")
      .eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return (data?.version ?? 0) + 1;
  }
}

/** Postgres' `unique_violation`, raised by the `(project_id, version)` index. */
function isVersionConflict(error: { code?: string }): boolean {
  return error.code === "23505";
}

/**
 * `total_duration_seconds` is constrained to the three configured durations. The use case already
 * derives the value from the project's own settings, so a value outside them is a programming
 * error: fail loudly here instead of letting the database reject the insert.
 */
function toStoredDuration(totalDurationSeconds: number): VideoDurationSeconds {
  const supported = VIDEO_DURATIONS_SECONDS.find((seconds) => seconds === totalDurationSeconds);
  if (supported === undefined) throw new Error("The storyboard duration is not one of the supported video durations.");
  return supported;
}

export function mapBriefRevision(row: BriefRevisionRow): VideoBriefRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    version: row.version,
    schemaVersion: row.schema_version,
    brief: row.brief,
    isComplete: row.is_complete,
    generatedBy: row.generated_by as GeneratedBy,
    sourceMessageIds: row.source_message_ids,
    createdAt: row.created_at,
  };
}

export function mapStoryboardRevision(row: StoryboardRevisionRow): VideoStoryboardRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    version: row.version,
    schemaVersion: row.schema_version,
    briefRevisionId: row.brief_revision_id,
    scenes: row.scenes,
    totalDurationSeconds: row.total_duration_seconds,
    generatedBy: row.generated_by as GeneratedBy,
    ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
    ...(row.approval_snapshot !== null ? { approvalSnapshot: row.approval_snapshot } : {}),
    createdAt: row.created_at,
  };
}
