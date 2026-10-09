import { MAX_ASSET_BYTES, type AssetObjectStore } from "../../domain/ai-service/assets";
import type { AIService } from "../../domain/ai-service/contracts";
import { campaignBriefSchema, draftSchema, type CampaignBrief, type CampaignDraft } from "../../domain/fnb/campaign";
import type { ProjectAssetRepository, VideoProjectRepository } from "../../domain/video/contracts";
import { VideoError } from "../../domain/video/errors";
import type { AssetLimits } from "../../domain/video/limits";
import { listProjectAssets, ProjectAssetResolver, registerProjectAsset, type RegisterProjectAssetCommand } from "../video/assets";
import type { CompositionArtifact, CompositionAsset } from "./composition";
import type { ApproveCampaignCommand, Campaign, CampaignRenderDispatch, CampaignRepository, OwnedCampaignCommand, OwnedRenderJobCommand, RenderCampaignCommand, SaveDraftCommand } from "./contracts";
import { generateCampaignDraft } from "./planner";

export type CampaignServices = {
  campaigns: CampaignRepository;
  projects: Pick<VideoProjectRepository, "getOwned" | "listOwned">;
  assets: ProjectAssetRepository;
  objectStore: AssetObjectStore;
  limits: AssetLimits;
  createId: () => string;
  signedUrl: (objectKey: string) => Promise<string>;
  createAI: () => AIService;
  build: (draft: CampaignDraft, assets: CompositionAsset[]) => Promise<CompositionArtifact>;
  validate: (html: string) => Promise<string[]>;
  enqueue: (dispatch: CampaignRenderDispatch) => Promise<void>;
};

export async function createCampaign(command: { title: string; userId: string }, dependencies: CampaignServices): Promise<Campaign> {
  const title = command.title.trim();

  if (!title || title.length > 120) throw new VideoError("video_input_invalid", "Enter a campaign title up to 120 characters.");

  return dependencies.campaigns.create({ ...command, title, id: dependencies.createId() });
}

export async function listCampaigns(userId: string, dependencies: CampaignServices): Promise<Campaign[]> {
  const [campaigns, projects] = await Promise.all([dependencies.campaigns.listOwned(userId), dependencies.projects.listOwned(userId)]);
  const active = new Set(projects.map((project) => project.id));

  return campaigns.filter((campaign) => active.has(campaign.id));
}

export async function getCampaign(command: OwnedCampaignCommand, dependencies: CampaignServices) {
  const campaign = await requireCampaign(command, dependencies);

  const [assets, versions, renderJobs] = await Promise.all([
    listProjectAssets({ userId: command.userId, projectId: campaign.id }, dependencies),
    dependencies.campaigns.listVersions(command), dependencies.campaigns.listRenderJobs(command),
  ]);

  return { campaign, assets, versions, renderJobs };
}

export async function uploadCampaignAsset(command: RegisterProjectAssetCommand, dependencies: CampaignServices) {
  await requireCampaign({ campaignId: command.projectId, userId: command.userId }, dependencies);
  const asset = await registerProjectAsset(command, dependencies);

  return { id: asset.id, mimeType: asset.mimeType, width: asset.width, height: asset.height, previewUrl: await dependencies.signedUrl(asset.objectKey) };
}

export async function generateCampaign(
  command: OwnedCampaignCommand & { brief: CampaignBrief; expectedRevision: number },
  dependencies: CampaignServices,
): Promise<Campaign> {
  const campaign = await requireCampaign(command, dependencies);
  assertExpectedRevision(campaign, command.expectedRevision);
  const brief = campaignBriefSchema.parse(command.brief);
  await resolveCompositionAssets({ campaignId: campaign.id, userId: command.userId, draft: { brief, plan: { scenes: [] } } }, dependencies);
  const draft = await generateCampaignDraft({ ...command, brief, requestId: dependencies.createId() }, dependencies.createAI());

  return saveCampaignDraft({ ...command, draft, initialPlan: draft.plan }, dependencies);
}

export async function saveCampaignDraft(command: SaveDraftCommand, dependencies: CampaignServices): Promise<Campaign> {
  const campaign = await requireCampaign(command, dependencies);
  const draft = draftSchema.parse(command.draft);
  const ownedCommand = { ...command, campaignId: campaign.id, draft };
  const saved = await dependencies.campaigns.saveDraft(ownedCommand);
  const outcome = await composeSavedDraft(ownedCommand, dependencies);

  return dependencies.campaigns.completeComposition({ ...ownedCommand, revision: saved.revision, ...outcome });
}

export async function approveCampaign(command: ApproveCampaignCommand, dependencies: CampaignServices): Promise<Campaign> {
  const campaign = await requireCampaign(command, dependencies);
  assertExpectedRevision(campaign, command.expectedRevision);

  if (!campaign.draft || campaign.compositionRevision !== campaign.revision || !campaign.compositionHash || campaign.validationErrors.length) {
    throw new VideoError("video_approval_incomplete", "Save a valid latest preview before approving.");
  }

  return dependencies.campaigns.approve(command);
}

export async function renderCampaign(command: RenderCampaignCommand, dependencies: CampaignServices) {
  await requireCampaign(command, dependencies);
  const { job, dispatch } = await dependencies.campaigns.intakeRender({ ...command, jobId: dependencies.createId(), dispatchToken: dependencies.createId() });

  if (!dispatch) return job;

  try {
    await dependencies.enqueue(dispatch);

    return job;
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : "";

    const message = diagnostic.includes("TRIGGER_SECRET_KEY")
      ? "Render worker is not configured. Set TRIGGER_SECRET_KEY on the backend and deploy the Trigger.dev worker, then retry."
      : diagnostic.includes("FNB_RENDER_DRIVER")
        ? "Set FNB_RENDER_DRIVER to local or trigger on the backend, then retry."
        : "Render could not be queued. Retry the render.";

    return dependencies.campaigns.failQueuedRender({ ...command, jobId: job.id, dispatchToken: dispatch.dispatchToken, error: message });
  }
}

export async function getCampaignRenderJob(command: OwnedRenderJobCommand, dependencies: CampaignServices) {
  await requireCampaign(command, dependencies);
  const job = await dependencies.campaigns.getRenderJob(command);

  if (!job) throw new VideoError("video_render_job_not_found", "The render job was not found.");

  return job;
}

export async function downloadCampaignRender(command: OwnedRenderJobCommand, dependencies: CampaignServices) {
  const job = await getCampaignRenderJob(command, dependencies);

  if (job.status !== "completed") throw new VideoError("video_state_conflict", "The video is not ready for download.");
  const key = await dependencies.campaigns.getOutputKey(command);

  if (!key) throw new VideoError("video_version_not_found", "The rendered video was not found.");

  return { url: await dependencies.signedUrl(key) };
}

export async function getCampaignComposition(command: OwnedCampaignCommand & { revision: number }, dependencies: CampaignServices) {
  await requireCampaign(command, dependencies);
  const version = await dependencies.campaigns.getVersion(command);

  if (!version?.validated || !version.compositionHtml) throw new VideoError("video_version_not_found", "The validated preview was not found.");

  return version.compositionHtml;
}

async function composeSavedDraft(command: OwnedCampaignCommand & { draft: CampaignDraft }, dependencies: CampaignServices): Promise<{ artifact: CompositionArtifact | null; errors: string[] }> {
  try {
    const assets = await resolveCompositionAssets(command, dependencies);
    const artifact = await dependencies.build(command.draft, assets);

    return { artifact, errors: await dependencies.validate(artifact.html) };
  } catch (error) {
    const message = error instanceof VideoError ? error.message : "The composition could not be validated. Check the assets and scene content, then save again.";

    return { artifact: null, errors: [message] };
  }
}

async function resolveCompositionAssets(
  command: OwnedCampaignCommand & { draft: { brief: CampaignBrief; plan: { scenes: Array<{ productAssetId: string }> } } },
  dependencies: CampaignServices,
): Promise<CompositionAsset[]> {
  const ids = new Set([command.draft.brief.productAssetId, ...command.draft.plan.scenes.map((scene) => scene.productAssetId)]);

  if (command.draft.brief.logoAssetId) ids.add(command.draft.brief.logoAssetId);
  const resolver = new ProjectAssetResolver(dependencies.assets, dependencies.objectStore);

  return Promise.all([...ids].map(async (id) => {
    const asset = await dependencies.assets.getOwned(id, command.userId);

    if (!asset || asset.projectId !== command.campaignId) throw new VideoError("video_asset_invalid", "Every scene asset must belong to this campaign.");
    const resolved = await resolver.resolve(id, command.userId, { maxImageBytes: MAX_ASSET_BYTES, maxImageWidth: dependencies.limits.maxImageDimension, maxImageHeight: dependencies.limits.maxImageDimension });

    return { id: resolved.assetId, mimeType: resolved.mimeType, bytes: resolved.bytes };
  }));
}

async function requireCampaign(command: OwnedCampaignCommand, dependencies: CampaignServices): Promise<Campaign> {
  const [campaign, project] = await Promise.all([dependencies.campaigns.getOwned(command), dependencies.projects.getOwned(command.campaignId, command.userId)]);

  if (!campaign || !project) throw new VideoError("video_project_not_found", "The campaign was not found.");

  return campaign;
}

function assertExpectedRevision(campaign: Campaign, expectedRevision: number): void {
  if (campaign.revision !== expectedRevision) throw new VideoError("video_state_conflict", "The campaign changed. Reload before saving or approving.");
}
