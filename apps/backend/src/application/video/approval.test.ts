import { describe, expect, it, vi } from "vitest";
import { approveVideoProject, buildApprovalSnapshot } from "./approval";
import type { VideoBriefRevision, VideoOutputSettings, VideoProject, VideoProjectStatus, VideoStoryboardRevision } from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const STORYBOARD_ID = "55555555-5555-4555-8555-555555555555";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };
const generatedBy = { profileId: "primary", provider: "9router", model: "router-model", promptVersion: "planner-v1", requestId: "req-1" };

const brief = {
  productName: "Kopi Susu", productCategory: null, audience: "Mahasiswa", objective: "Tambah pesanan", keyMessage: "Manisnya pas",
  offer: null, callToAction: "Pesan sekarang", orderDestination: null, brandName: null,
  styleId: "bold_pop", outputSettings: settings, menuItems: null, facts: [],
};

const scenes = [
  { order: 1, startSeconds: 0, endSeconds: 5, visual: "Produk", onScreenTitle: "Kopi Susu", onScreenCopy: "Manisnya pas", voiceOver: "Coba", caption: "Coba", assetIds: [ASSET_ID], audioCue: null, transition: "fade" },
  { order: 2, startSeconds: 5, endSeconds: 10, visual: "Logo", onScreenTitle: "Pesan", onScreenCopy: "WhatsApp", voiceOver: "Pesan sekarang", caption: "Pesan sekarang", assetIds: [ASSET_ID], audioCue: null, transition: "cut" },
];

function videoProject(status: VideoProjectStatus): VideoProject {
  return {
    id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop",
    status, settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated",
  };
}

function briefRevision(): VideoBriefRevision {
  return {
    id: BRIEF_ID, projectId: PROJECT_ID, userId: USER_ID, version: 2, schemaVersion: "brief@v1",
    brief, isComplete: true, generatedBy, sourceMessageIds: [], createdAt: "created",
  };
}

function storyboardRevision(overrides: Partial<VideoStoryboardRevision> = {}): VideoStoryboardRevision {
  return {
    id: STORYBOARD_ID, projectId: PROJECT_ID, userId: USER_ID, version: 3, schemaVersion: "storyboard@v1",
    briefRevisionId: BRIEF_ID, scenes, totalDurationSeconds: 10, generatedBy, createdAt: "created",
    ...overrides,
  };
}

function dependencies(overrides: { status?: VideoProjectStatus; brief?: unknown; scenes?: unknown; briefRevisionId?: string; approvedAt?: string | null } = {}) {
  const approvedAt = overrides.approvedAt === undefined ? "2026-09-21T10:00:00.000Z" : overrides.approvedAt;
  const approvalSnapshot = approvedAt === null
    ? {}
    : {
        approvalSnapshot: buildApprovalSnapshot({
          project: { videoType: "product_promo", styleId: "bold_pop", settings },
          briefRevision: { id: BRIEF_ID, version: 2 },
          storyboardRevision: { id: STORYBOARD_ID, version: 3 },
          generatedBy,
          approvedAt,
        }),
        approvedAt,
      };

  return {
    now: () => "2026-09-21T10:00:00.000Z",
    projects: {
      getOwned: vi.fn(async (): Promise<VideoProject | null> => videoProject(overrides.status ?? "awaiting_approval")),
      transition: vi.fn(async (): Promise<VideoProject | null> => videoProject("approved")),
    },
    briefRevisions: {
      latestOwned: vi.fn(async (): Promise<VideoBriefRevision | null> => ({ ...briefRevision(), brief: overrides.brief ?? brief })),
    },
    storyboardRevisions: {
      latestOwned: vi.fn(async (): Promise<VideoStoryboardRevision | null> => storyboardRevision({ briefRevisionId: overrides.briefRevisionId ?? BRIEF_ID, scenes: overrides.scenes ?? scenes, ...approvalSnapshot })),
      approve: vi.fn(async (revisionId: string, userId: string, approvedAt: string, snapshot: unknown): Promise<VideoStoryboardRevision | null> => storyboardRevision({ id: revisionId, approvedAt, approvalSnapshot: snapshot })),
    },
  };
}

describe("approveVideoProject", () => {
  it("freezes the brief, storyboard, settings, style, and provider identity", async () => {
    const deps = dependencies();

    const { project, approval } = await approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(project.status).toBe("approved");
    expect(approval).toMatchObject({
      schemaVersion: "video-approval@v1",
      approvedAt: "2026-09-21T10:00:00.000Z",
      briefRevisionId: BRIEF_ID,
      briefVersion: 2,
      storyboardRevisionId: STORYBOARD_ID,
      storyboardVersion: 3,
      styleId: "bold_pop",
      settings,
      promptVersion: "planner-v1",
      provider: "9router",
      model: "router-model",
      profileId: "primary",
    });
  });

  it("refuses a brief that is missing a required field for the video type", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ brief: { ...brief, callToAction: null } })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("refuses a commercial fact the user never confirmed and names it", async () => {
    const priced = { ...brief, offer: { label: "Promo", detail: "Diskon 30%" } };

    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ brief: priced })))
      .rejects.toThrowError(/offer\.label/);
  });

  it("refuses a storyboard that does not fill the project duration", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ scenes: [scenes[0]] })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("refuses a storyboard built from a different brief revision", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ briefRevisionId: "66666666-6666-4666-8666-666666666666" })))
      .rejects.toMatchObject({ code: "video_approval_incomplete" });
  });

  it("refuses to approve a project that is not awaiting approval", async () => {
    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, dependencies({ status: "draft" })))
      .rejects.toMatchObject({ code: "video_state_conflict" });
  });

  it("returns the frozen snapshot on a repeated approval without writing again", async () => {
    const deps = dependencies({ status: "approved", approvedAt: "2026-09-21T10:00:00.000Z" });

    const { approval } = await approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(approval.storyboardRevisionId).toBe(STORYBOARD_ID);
    expect(deps.storyboardRevisions.approve).not.toHaveBeenCalled();
  });

  it("refuses to re-derive a snapshot for an approved project with no approved storyboard", async () => {
    const deps = dependencies({ status: "approved", approvedAt: null });

    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, deps))
      .rejects.toMatchObject({ code: "video_state_conflict" });
    expect(deps.storyboardRevisions.approve).not.toHaveBeenCalled();
  });

  it("treats a lost transition race as an already approved project", async () => {
    const deps = dependencies();
    deps.projects.transition.mockResolvedValue(null);
    deps.projects.getOwned
      .mockResolvedValueOnce(videoProject("awaiting_approval"))
      .mockResolvedValue(videoProject("approved"));

    await expect(approveVideoProject({ userId: USER_ID, projectId: PROJECT_ID }, deps)).resolves.toMatchObject({ project: { status: "approved" } });
  });
});
