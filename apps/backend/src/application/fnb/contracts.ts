import type { CampaignDraft, VideoPlan } from "../../domain/fnb/campaign";
import type { CompositionArtifact } from "./composition";

export type Campaign = {
  id: string;
  title: string;
  revision: number;
  status: "draft" | "approved" | "rendering" | "completed" | "failed";
  draft: CampaignDraft | null;
  initialPlan: VideoPlan | null;
  compositionRevision: number | null;
  compositionHash: string | null;
  validationErrors: string[];
  approvedRevision: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignVersion = {
  revision: number;
  draft: CampaignDraft;
  compositionHtml: string | null;
  compositionHash: string | null;
  validated: boolean;
  approvedAt: string | null;
};

export type CampaignRenderJob = {
  id: string;
  campaignId: string;
  idempotencyKey: string;
  revision: number;
  status: "queued" | "rendering" | "completed" | "failed";
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnedCampaignCommand = { campaignId: string; userId: string };

export type SaveDraftCommand = OwnedCampaignCommand & { expectedRevision: number; draft: CampaignDraft; initialPlan?: VideoPlan };

export type CompleteCompositionCommand = OwnedCampaignCommand & { revision: number; artifact: CompositionArtifact | null; errors: string[] };

export type ApproveCampaignCommand = OwnedCampaignCommand & { expectedRevision: number };

export type RenderCampaignCommand = OwnedCampaignCommand & { revision: number; idempotencyKey: string };

export type OwnedRenderJobCommand = OwnedCampaignCommand & { jobId: string };

export type CampaignRenderAttempt = { jobId: string; attemptToken: string };

export type CampaignRenderDispatch = CampaignRenderAttempt & { dispatchToken: string };

export type CampaignRenderIntake = { job: CampaignRenderJob; dispatch: CampaignRenderDispatch | null };

export type IntakeRenderCommand = RenderCampaignCommand & { jobId: string; dispatchToken: string };

export type FailQueuedRenderCommand = OwnedRenderJobCommand & { dispatchToken: string; error: string };

export interface CampaignRepository {
  create(input: { id: string; userId: string; title: string }): Promise<Campaign>;
  getOwned(command: OwnedCampaignCommand): Promise<Campaign | null>;
  listOwned(userId: string): Promise<Campaign[]>;
  saveDraft(command: SaveDraftCommand): Promise<Campaign>;
  completeComposition(command: CompleteCompositionCommand): Promise<Campaign>;
  approve(command: ApproveCampaignCommand): Promise<Campaign>;
  listVersions(command: OwnedCampaignCommand): Promise<CampaignVersion[]>;
  getVersion(command: OwnedCampaignCommand & { revision: number }): Promise<CampaignVersion | null>;
  intakeRender(command: IntakeRenderCommand): Promise<CampaignRenderIntake>;
  listRenderJobs(command: OwnedCampaignCommand): Promise<CampaignRenderJob[]>;
  getRenderJob(command: OwnedRenderJobCommand): Promise<CampaignRenderJob | null>;
  failQueuedRender(command: FailQueuedRenderCommand): Promise<CampaignRenderJob>;
  getOutputKey(command: OwnedRenderJobCommand): Promise<string | null>;
}
