import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SCENE_TIMELINE, STYLE_PRESETS, draftSchema } from "../../domain/fnb/campaign";
import { VideoError } from "../../domain/video/errors";
import type { ProjectAsset, VideoProject } from "../../domain/video/types";
import { approveCampaign, downloadCampaignRender, getCampaignComposition, renderCampaign, saveCampaignDraft, type CampaignServices } from "./campaigns";
import type { CompositionArtifact } from "./composition";
import type { ApproveCampaignCommand, Campaign, CampaignRenderDispatch, CampaignRenderIntake, CampaignRenderJob, CompleteCompositionCommand, FailQueuedRenderCommand, IntakeRenderCommand, SaveDraftCommand } from "./contracts";

const userId = "11111111-1111-4111-8111-111111111111";

const campaignId = "33333333-3333-4333-8333-333333333333";

const assetId = "22222222-2222-4222-8222-222222222222";

const jobId = "44444444-4444-4444-8444-444444444444";

const attemptToken = "55555555-5555-4555-8555-555555555555";

const command = { userId, campaignId };

const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxAADCBYAG10BBdmDt4sAAAAASUVORK5CYII=", "base64"));

const draft = draftSchema.parse({
  brief: { campaignName: "Promo Kopi", productName: "Kopi Susu", brandName: "Kedai", originalPrice: 25000, discountPercent: 20, promoPeriod: "", cta: "Pesan sekarang", productAssetId: assetId, logoAssetId: null },
  plan: { scenes: SCENE_TIMELINE.map((timing) => ({ ...timing, headline: timing.id === "discount" ? "Diskon 20%" : "Kopi Susu", subheadline: "", cta: "Pesan sekarang", productAssetId: assetId })) },
  style: STYLE_PRESETS[0]!.tokens,
});

const artifact: CompositionArtifact = { html: "<html>frozen preview</html>", hash: "b".repeat(64), spec: { version: 1, libraryVersion: "2", compositionId: "fnb-campaign", width: 1080, height: 1920, duration: 15, originalPrice: 25000, discountedPrice: 20000, discountPercent: 20, style: draft.style, scenes: [] } };

function fixture(overrides: Partial<Campaign> = {}) {
  let campaign: Campaign = { id: campaignId, title: "Promo Kopi", revision: 1, status: "draft", draft, initialPlan: draft.plan, compositionRevision: 1, compositionHash: "a".repeat(64), validationErrors: [], approvedRevision: null, createdAt: "created", updatedAt: "updated", ...overrides };
  const project: VideoProject = { id: campaignId, userId, title: campaign.title, videoType: "discount_promo", styleId: "bold_pop", status: "draft", settings: { durationSeconds: 15, aspectRatio: "9:16", resolution: "1080p", language: "id", musicEnabled: false, voiceOverEnabled: false }, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated" };
  const asset: ProjectAsset = { id: assetId, userId, projectId: campaignId, objectKey: "private/product.png", mimeType: "image/png", byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), width: 2, height: 3, rightsConfirmedAt: "confirmed", moderationStatus: "allowed", createdAt: "created" };
  let job: CampaignRenderJob = { id: jobId, campaignId, idempotencyKey: "render-fixture-key", revision: 1, status: "queued", error: null, createdAt: "created", updatedAt: "updated" };
  let leaseToken: string | null = null;
  let renderAttemptToken = attemptToken;

  const services = {
    campaigns: {
      create: vi.fn(async () => campaign), getOwned: vi.fn(async (): Promise<Campaign | null> => ({ ...campaign })), listOwned: vi.fn(async () => [campaign]),
      saveDraft: vi.fn(async (input: SaveDraftCommand) => {
        if (campaign.revision !== input.expectedRevision) throw new VideoError("video_state_conflict", "Revision changed.");
        campaign = { ...campaign, revision: campaign.revision + 1, draft: input.draft, approvedRevision: null, status: "draft", validationErrors: ["Composition is being validated."] };

        return { ...campaign };
      }),
      completeComposition: vi.fn(async (input: CompleteCompositionCommand) => {
        if (campaign.revision !== input.revision) throw new VideoError("video_state_conflict", "Revision changed.");
        campaign = { ...campaign, validationErrors: input.errors };

        if (input.artifact && !input.errors.length) {
          campaign.compositionRevision = input.revision;
          campaign.compositionHash = input.artifact.hash;
        }

        return { ...campaign };
      }),
      approve: vi.fn(async (input: ApproveCampaignCommand) => {
        if (campaign.revision !== input.expectedRevision) throw new VideoError("video_state_conflict", "Revision changed.");
        campaign = { ...campaign, approvedRevision: input.expectedRevision, status: "approved" };

        return { ...campaign };
      }),
      listVersions: vi.fn(async () => []),
      getVersion: vi.fn(async () => ({ revision: 1, draft, compositionHtml: artifact.html, compositionHash: artifact.hash, validated: true, approvedAt: "approved" })),
      intakeRender: vi.fn(async (input: IntakeRenderCommand): Promise<CampaignRenderIntake> => {
        if (job.status === "failed") {
          job = { ...job, status: "queued", error: null };
          renderAttemptToken = input.jobId;
        }

        if (job.status !== "queued" || leaseToken) return { job: { ...job }, dispatch: null };
        leaseToken = input.dispatchToken;

        return { job: { ...job }, dispatch: { jobId: job.id, attemptToken: renderAttemptToken, dispatchToken: leaseToken } };
      }), listRenderJobs: vi.fn(async () => [job]), getRenderJob: vi.fn(async () => ({ ...job })),
      failQueuedRender: vi.fn(async (input: FailQueuedRenderCommand) => {
        if (job.status === "queued" && leaseToken === input.dispatchToken) {
          job = { ...job, status: "failed", error: input.error };
          leaseToken = null;
        }

        return { ...job };
      }),
      getOutputKey: vi.fn(async () => "fnb-renders/private/output.mp4"),
    },
    projects: { getOwned: vi.fn(async () => project), listOwned: vi.fn(async () => [project]) },
    assets: { create: vi.fn(async () => asset), getOwned: vi.fn(async () => asset), listOwned: vi.fn(async () => [asset]), sumActiveBytes: vi.fn(async () => bytes.byteLength), softDelete: vi.fn(async () => undefined) },
    objectStore: { read: vi.fn(async () => bytes), write: vi.fn(async () => undefined), delete: vi.fn(async () => undefined) },
    limits: { maxAssetsPerProject: 8, maxProjectAssetBytes: 40 * 1024 * 1024, minImageDimension: 1, maxImageDimension: 8000 },
    createId: randomUUID, signedUrl: vi.fn(async () => "https://storage.example/signed/output"),
    createAI: () => ({ generateText: vi.fn(async () => { throw new Error("Not used"); }), generateStructured: vi.fn(async () => { throw new Error("Not used"); }) }),
    build: vi.fn(async () => artifact), validate: vi.fn(async (): Promise<string[]> => []), enqueue: vi.fn(async (_dispatch: CampaignRenderDispatch) => undefined),
  } satisfies CampaignServices;

  return { services, current: () => campaign, recoverLease: (token: string) => { leaseToken = token; } };
}

describe("campaign approval", () => {
  it.each([
    { revision: 2, compositionRevision: 1 },
    { validationErrors: ["Text overflows."] },
    { compositionHash: null },
    { draft: null },
  ])("refuses invalid or outdated composition %j", async (state) => {
    const { services, current } = fixture(state);
    await expect(approveCampaign({ ...command, expectedRevision: current().revision }, services)).rejects.toMatchObject({ code: "video_approval_incomplete" });
    expect(services.campaigns.approve).not.toHaveBeenCalled();
  });

  it("does not recompose during approval and pins the exact expected revision", async () => {
    const { services } = fixture();
    const approved = await approveCampaign({ ...command, expectedRevision: 1 }, services);
    expect(approved.approvedRevision).toBe(1);
    expect(services.campaigns.approve).toHaveBeenCalledWith({ ...command, expectedRevision: 1 });
    expect(services.build).not.toHaveBeenCalled();
  });

  it("honors the atomic database rejection when a save races the preflight read", async () => {
    const { services } = fixture();
    services.campaigns.approve.mockRejectedValueOnce(new VideoError("video_state_conflict", "Revision changed."));
    await expect(approveCampaign({ ...command, expectedRevision: 1 }, services)).rejects.toMatchObject({ code: "video_state_conflict" });
  });
});

describe("campaign draft concurrency", () => {
  it("persists failed draft composition without discarding the prior preview", async () => {
    const { services } = fixture();
    services.validate.mockResolvedValueOnce(["Text overflows."]);
    const saved = await saveCampaignDraft({ ...command, draft, expectedRevision: 1 }, services);
    expect(saved).toMatchObject({ revision: 2, draft, compositionRevision: 1, compositionHash: "a".repeat(64), validationErrors: ["Text overflows."] });
    await expect(approveCampaign({ ...command, expectedRevision: 2 }, services)).rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("only one simultaneous writer can consume an expected revision", async () => {
    const { services, current } = fixture();

    const results = await Promise.allSettled([
      saveCampaignDraft({ ...command, draft, expectedRevision: 1 }, services),
      saveCampaignDraft({ ...command, draft, expectedRevision: 1 }, services),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(current().revision).toBe(2);
    expect(services.build).toHaveBeenCalledTimes(1);
  });

  it("a slow older validation cannot publish over a newer saved composition", async () => {
    const { services, current } = fixture();
    let release!: () => void;
    let started!: () => void;
    const validationStarted = new Promise<void>((resolve) => { started = resolve; });
    const validationReleased = new Promise<void>((resolve) => { release = resolve; });
    services.validate.mockImplementationOnce(async () => { started(); await validationReleased;

 return []; });
    const oldSave = saveCampaignDraft({ ...command, draft, expectedRevision: 1 }, services);
    await validationStarted;
    await saveCampaignDraft({ ...command, draft, expectedRevision: 2 }, services);
    release();
    await expect(oldSave).rejects.toMatchObject({ code: "video_state_conflict" });
    expect(current()).toMatchObject({ revision: 3, compositionRevision: 3, validationErrors: [] });
  });

  it("makes a fresh draft revision after approval rather than mutating the approved version", async () => {
    const { services } = fixture({ approvedRevision: 1, status: "approved" });
    const saved = await saveCampaignDraft({ ...command, draft, expectedRevision: 1 }, services);
    expect(saved).toMatchObject({ revision: 2, approvedRevision: null, status: "draft" });
    expect(services.campaigns.approve).not.toHaveBeenCalled();
  });

  it("uses the database's canonical campaign UUID when checking owned assets", async () => {
    const canonicalId = "33333333-abcd-4333-8333-333333333333";
    const { services } = fixture({ id: canonicalId });
    const asset = await services.assets.getOwned();
    services.assets.getOwned.mockResolvedValue({ ...asset, projectId: canonicalId });
    const saved = await saveCampaignDraft({ ...command, campaignId: canonicalId.toUpperCase(), draft, expectedRevision: 1 }, services);
    expect(saved.validationErrors).toEqual([]);
    expect(services.campaigns.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ campaignId: canonicalId }));
  });

  it("refuses another campaign's product bytes before building", async () => {
    const { services } = fixture();
    const owned = await services.assets.getOwned();
    services.assets.getOwned.mockResolvedValue({ ...owned, projectId: "55555555-5555-4555-8555-555555555555" });
    const saved = await saveCampaignDraft({ ...command, draft, expectedRevision: 1 }, services);
    expect(saved.validationErrors).toEqual(["Every scene asset must belong to this campaign."]);
    expect(services.objectStore.read).not.toHaveBeenCalled();
    expect(services.build).not.toHaveBeenCalled();
  });
});

describe("durable campaign render intake", () => {
  it("retains a retryable failed job and its approved draft when dispatch fails", async () => {
    const { services, current } = fixture({ status: "approved", approvedRevision: 1 });
    services.enqueue.mockRejectedValueOnce(new Error("TRIGGER_SECRET_KEY required"));
    const job = await renderCampaign({ ...command, revision: 1, idempotencyKey: "render-key-1" }, services);
    expect(job).toMatchObject({ id: jobId, status: "failed" });
    expect(job.error).toContain("TRIGGER_SECRET_KEY");
    expect(current().draft).toEqual(draft);
  });

  it("does not dispatch an existing completed job for the same intake key", async () => {
    const { services } = fixture();
    services.campaigns.intakeRender.mockResolvedValueOnce({ job: { id: jobId, campaignId, revision: 1, idempotencyKey: "render-key-1", status: "completed", error: null, createdAt: "created", updatedAt: "updated" }, dispatch: null });
    const job = await renderCampaign({ ...command, revision: 1, idempotencyKey: "render-key-1" }, services);
    expect(job.status).toBe("completed");
    expect(services.enqueue).not.toHaveBeenCalled();
  });

  it("dispatches only the lease winner when same-key requests race a failing sibling enqueue", async () => {
    const { services } = fixture({ status: "approved", approvedRevision: 1 });
    let accepted!: () => void;
    let release!: () => void;
    const submissionAccepted = new Promise<void>((resolve) => { accepted = resolve; });
    const submissionReleased = new Promise<void>((resolve) => { release = resolve; });
    services.enqueue.mockImplementationOnce(async () => { accepted(); await submissionReleased; });
    services.enqueue.mockRejectedValueOnce(new Error("Sibling queue unavailable"));
    const request = { ...command, revision: 1, idempotencyKey: "render-key-1" };
    const winner = renderCampaign(request, services);
    await submissionAccepted;
    const replay = await renderCampaign(request, services);
    release();
    expect(await winner).toMatchObject({ id: jobId, status: "queued" });
    expect(replay).toMatchObject({ id: jobId, status: "queued" });
    expect(services.enqueue).toHaveBeenCalledTimes(1);
    expect(services.campaigns.failQueuedRender).not.toHaveBeenCalled();
  });

  it("ignores a stale dispatch owner's failure after recovery takes its lease", async () => {
    const { services, recoverLease } = fixture();
    await services.campaigns.intakeRender({ ...command, revision: 1, idempotencyKey: "render-key-1", jobId, dispatchToken: jobId });
    recoverLease(attemptToken);
    const failed = await services.campaigns.failQueuedRender({ ...command, jobId, dispatchToken: jobId, error: "Stale enqueue failure" });
    expect(failed.status).toBe("queued");
  });

  it("reuses a failed job UUID with a fresh attempt when explicitly retried", async () => {
    const { services } = fixture({ status: "approved", approvedRevision: 1 });
    services.enqueue.mockRejectedValueOnce(new Error("Queue offline"));
    const request = { ...command, revision: 1, idempotencyKey: "render-key-1" };
    expect((await renderCampaign(request, services)).status).toBe("failed");
    expect(await renderCampaign(request, services)).toMatchObject({ id: jobId, status: "queued" });
    const [first, retry] = services.enqueue.mock.calls.map(([dispatch]) => dispatch);
    expect(first!.jobId).toBe(retry!.jobId);
    expect(first!.attemptToken).not.toBe(retry!.attemptToken);
  });

  it("cannot sign an unfinished render", async () => {
    const { services } = fixture();
    await expect(downloadCampaignRender({ ...command, jobId }, services)).rejects.toMatchObject({ code: "video_state_conflict" });
    expect(services.signedUrl).not.toHaveBeenCalled();
  });

  it("cannot expose another owner's frozen composition", async () => {
    const { services } = fixture();
    services.campaigns.getOwned.mockResolvedValueOnce(null);
    await expect(getCampaignComposition({ ...command, revision: 1 }, services)).rejects.toMatchObject({ code: "video_project_not_found" });
    expect(services.campaigns.getVersion).not.toHaveBeenCalled();
  });
});
