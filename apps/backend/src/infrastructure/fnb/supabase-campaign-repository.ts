import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@visuala/db";
import { z } from "zod";
import { draftSchema, videoPlanSchema } from "../../domain/fnb/campaign";
import { VideoError } from "../../domain/video/errors";
import type { ApproveCampaignCommand, Campaign, CampaignRenderIntake, CampaignRenderJob, CampaignRepository, CampaignVersion, CompleteCompositionCommand, FailQueuedRenderCommand, IntakeRenderCommand, OwnedCampaignCommand, OwnedRenderJobCommand, SaveDraftCommand } from "../../application/fnb/contracts";

type CampaignRow = Database["public"]["Tables"]["fnb_campaigns"]["Row"];

type VersionRow = Database["public"]["Tables"]["fnb_campaign_versions"]["Row"];

type JobRow = Database["public"]["Tables"]["fnb_render_jobs"]["Row"];

export class SupabaseCampaignRepository implements CampaignRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: { id: string; userId: string; title: string }): Promise<Campaign> {
    const { data, error } = await this.supabase.rpc("create_fnb_campaign", { p_id: input.id, p_user_id: input.userId, p_title: input.title });

    if (error) throwPersistenceError(error);

    return mapCampaign(data!);
  }

  async getOwned(command: OwnedCampaignCommand): Promise<Campaign | null> {
    const { data, error } = await this.supabase.from("fnb_campaigns").select("*").eq("id", command.campaignId).eq("user_id", command.userId).maybeSingle();

    if (error) throwPersistenceError(error);

    return data ? mapCampaign(data) : null;
  }

  async listOwned(userId: string): Promise<Campaign[]> {
    const { data, error } = await this.supabase.from("fnb_campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false });

    if (error) throwPersistenceError(error);

    return (data ?? []).map(mapCampaign);
  }

  async saveDraft(command: SaveDraftCommand): Promise<Campaign> {
    const { data, error } = await this.supabase.rpc("save_fnb_campaign_draft", {
      p_id: command.campaignId, p_user_id: command.userId, p_expected_revision: command.expectedRevision,
      p_draft: command.draft, p_initial_plan: command.initialPlan ?? null,
    });

    if (error) throwPersistenceError(error);

    return mapCampaign(data!);
  }

  async completeComposition(command: CompleteCompositionCommand): Promise<Campaign> {
    const { data, error } = await this.supabase.rpc("complete_fnb_campaign_composition", {
      p_id: command.campaignId, p_user_id: command.userId, p_revision: command.revision,
      p_html: command.artifact?.html ?? null, p_hash: command.artifact?.hash ?? null,
      p_spec: command.artifact?.spec ?? null, p_errors: command.errors,
    });

    if (error) throwPersistenceError(error);

    return mapCampaign(data!);
  }

  async approve(command: ApproveCampaignCommand): Promise<Campaign> {
    const { data, error } = await this.supabase.rpc("approve_fnb_campaign", {
      p_id: command.campaignId, p_user_id: command.userId, p_expected_revision: command.expectedRevision,
    });

    if (error) throwPersistenceError(error);

    return mapCampaign(data!);
  }

  async listVersions(command: OwnedCampaignCommand): Promise<CampaignVersion[]> {
    const { data, error } = await this.supabase.from("fnb_campaign_versions").select("*").eq("campaign_id", command.campaignId).eq("user_id", command.userId).order("revision", { ascending: false });

    if (error) throwPersistenceError(error);

    return (data ?? []).map(mapVersion);
  }

  async getVersion(command: OwnedCampaignCommand & { revision: number }): Promise<CampaignVersion | null> {
    const { data, error } = await this.supabase.from("fnb_campaign_versions").select("*").eq("campaign_id", command.campaignId).eq("user_id", command.userId).eq("revision", command.revision).maybeSingle();

    if (error) throwPersistenceError(error);

    return data ? mapVersion(data) : null;
  }

  async intakeRender(command: IntakeRenderCommand): Promise<CampaignRenderIntake> {
    const { data, error } = await this.supabase.rpc("intake_fnb_campaign_render", {
      p_id: command.campaignId, p_user_id: command.userId, p_revision: command.revision,
      p_idempotency_key: command.idempotencyKey, p_job_id: command.jobId, p_dispatch_token: command.dispatchToken,
    });

    if (error) throwPersistenceError(error);
    const row = data!;

    return { job: mapJob(row), dispatch: row.status === "queued" && row.dispatch_token === command.dispatchToken
      ? { jobId: row.id, attemptToken: row.attempt_token, dispatchToken: command.dispatchToken } : null };
  }

  async listRenderJobs(command: OwnedCampaignCommand): Promise<CampaignRenderJob[]> {
    const { data, error } = await this.supabase.from("fnb_render_jobs").select("*").eq("campaign_id", command.campaignId).eq("user_id", command.userId).order("created_at", { ascending: false });

    if (error) throwPersistenceError(error);

    return (data ?? []).map(mapJob);
  }

  async getRenderJob(command: OwnedRenderJobCommand): Promise<CampaignRenderJob | null> {
    const { data, error } = await this.supabase.from("fnb_render_jobs").select("*").eq("id", command.jobId).eq("campaign_id", command.campaignId).eq("user_id", command.userId).maybeSingle();

    if (error) throwPersistenceError(error);

    return data ? mapJob(data) : null;
  }

  async failQueuedRender(command: FailQueuedRenderCommand): Promise<CampaignRenderJob> {
    const { data, error } = await this.supabase.rpc("fail_fnb_queued_render", {
      p_id: command.campaignId, p_user_id: command.userId, p_job_id: command.jobId, p_dispatch_token: command.dispatchToken, p_error: command.error,
    });

    if (error) throwPersistenceError(error);

    return mapJob(data!);
  }

  async getOutputKey(command: OwnedRenderJobCommand): Promise<string | null> {
    const { data, error } = await this.supabase.from("fnb_render_jobs").select("output_object_key").eq("id", command.jobId).eq("campaign_id", command.campaignId).eq("user_id", command.userId).eq("status", "completed").maybeSingle();

    if (error) throwPersistenceError(error);

    return data?.output_object_key ?? null;
  }
}

export function mapCampaign(row: CampaignRow): Campaign {
  return { id: row.id, title: row.title, revision: row.revision, status: row.status,
    draft: row.draft === null ? null : draftSchema.parse(row.draft),
    initialPlan: row.initial_plan === null ? null : videoPlanSchema.parse(row.initial_plan),
    compositionRevision: row.composition_revision, compositionHash: row.composition_hash,
    validationErrors: z.array(z.string()).parse(row.validation_errors), approvedRevision: row.approved_revision,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapVersion(row: VersionRow): CampaignVersion {
  return { revision: row.revision, draft: draftSchema.parse(row.draft), compositionHtml: row.composition_html,
    compositionHash: row.composition_hash, validated: row.validated, approvedAt: row.approved_at };
}

function mapJob(row: JobRow): CampaignRenderJob {
  return { id: row.id, campaignId: row.campaign_id, idempotencyKey: row.idempotency_key, revision: row.revision, status: row.status,
    error: row.error, createdAt: row.created_at, updatedAt: row.updated_at };
}

function throwPersistenceError(error: { code: string; message: string }): never {
  if (error.message.includes("fnb_not_found")) throw new VideoError("video_project_not_found", "The campaign was not found.");

  if (error.message.includes("fnb_approval_conflict")) throw new VideoError("video_approval_incomplete", "Save a valid latest preview and approve its exact revision before rendering.");

  if (error.message.includes("fnb_revision_conflict")) throw new VideoError("video_state_conflict", "The campaign changed. Reload before saving or approving.");

  if (error.message.includes("fnb_idempotency_conflict")) throw new VideoError("video_state_conflict", "This render key already belongs to a different revision.");

  if (error.message.includes("fnb_render_conflict") || error.code === "23505") throw new VideoError("video_state_conflict", "A render is already active for this campaign.");
  throw error;
}
