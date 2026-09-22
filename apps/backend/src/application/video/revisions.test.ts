import { describe, expect, it, vi } from "vitest";
import { findMissingBriefFields } from "../../domain/video/brief";
import { getLatestBriefRevision, getLatestStoryboardRevision, saveBriefRevision, saveStoryboardRevision } from "./revisions";
import type { VideoBriefRevision, VideoOutputSettings, VideoProject, VideoStoryboardRevision } from "../../domain/video/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const generatedBy = { profileId: "primary", provider: "9router", model: "router-model", promptVersion: "interviewer-v1", requestId: "req-1" };
const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

const brief = {
  productName: "Kopi Susu", productCategory: null, audience: "Mahasiswa", objective: "Tambah pesanan", keyMessage: "Manisnya pas",
  offer: null, callToAction: "Pesan sekarang", orderDestination: null, brandName: null,
  styleId: "bold_pop", outputSettings: settings, menuItems: null, facts: [],
};

const scenes = [
  { order: 1, startSeconds: 0, endSeconds: 5, visual: "Produk di meja", onScreenTitle: "Kopi Susu", onScreenCopy: "Manisnya pas", voiceOver: "Coba kopi susu kami", caption: "Coba kopi susu kami", assetIds: [ASSET_ID], audioCue: null, transition: "fade" },
  { order: 2, startSeconds: 5, endSeconds: 10, visual: "Logo", onScreenTitle: "Pesan sekarang", onScreenCopy: "WhatsApp kami", voiceOver: "Pesan sekarang", caption: "Pesan sekarang", assetIds: [ASSET_ID], audioCue: null, transition: "cut" },
];

function project(): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status: "interviewing", settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated" };
}

function briefRevision(): VideoBriefRevision {
  return { id: BRIEF_ID, projectId: PROJECT_ID, userId: USER_ID, version: 1, schemaVersion: "brief@v1", brief, isComplete: true, generatedBy, sourceMessageIds: [], createdAt: "created" };
}

function dependencies() {
  return {
    projects: { getOwned: vi.fn(async (): Promise<VideoProject | null> => project()) },
    briefRevisions: { create: vi.fn(async (input) => ({ ...input, id: BRIEF_ID, version: 1, createdAt: "created" })), latestOwned: vi.fn(async (): Promise<VideoBriefRevision | null> => null), getOwned: vi.fn(async (): Promise<VideoBriefRevision | null> => briefRevision()) },
    storyboardRevisions: { create: vi.fn(async (input) => ({ ...input, id: "sb-1", version: 1, createdAt: "created" })), latestOwned: vi.fn(async (): Promise<VideoStoryboardRevision | null> => null) },
    createId: () => "id-1",
  };
}

function storyboardRevision(): VideoStoryboardRevision {
  return { id: "sb-1", projectId: PROJECT_ID, userId: USER_ID, version: 2, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes, totalDurationSeconds: 10, generatedBy, approvedAt: "approved", approvalSnapshot: {}, createdAt: "created" };
}

describe("saveBriefRevision", () => {
  it("marks a complete brief complete", async () => {
    const revision = await saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief, generatedBy, sourceMessageIds: [] }, dependencies());

    expect(revision.isComplete).toBe(true);
  });

  it("marks a brief with a missing required field incomplete", async () => {
    const incomplete = { ...brief, callToAction: null };

    expect(findMissingBriefFields(incomplete as never, "product_promo")).toEqual(["callToAction"]);
    const revision = await saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief: incomplete, generatedBy, sourceMessageIds: [] }, dependencies());
    expect(revision.isComplete).toBe(false);
  });

  it("marks a brief with an unconfirmed price incomplete and stores the unparsed value unchanged", async () => {
    const priced = { ...brief, offer: { label: "Promo", detail: "Diskon 30%" } };
    const deps = dependencies();

    const revision = await saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief: priced, generatedBy, sourceMessageIds: [] }, deps);

    expect(revision.isComplete).toBe(false);
    expect(deps.briefRevisions.create.mock.calls[0]?.[0].brief).toEqual(priced);
  });

  it("rejects a brief the schema cannot represent", async () => {
    await expect(saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "brief@v1", brief: { ...brief, discountPercent: 50 }, generatedBy, sourceMessageIds: [] }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });
});

describe("saveStoryboardRevision", () => {
  it("stores a storyboard that fills the project duration", async () => {
    const revision = await saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes, generatedBy }, dependencies());

    expect(revision.totalDurationSeconds).toBe(10);
  });

  it("rejects a storyboard with a timeline gap or the wrong total", async () => {
    const gapped = [scenes[0], { ...scenes[1], startSeconds: 6, endSeconds: 11 }];
    const short = [scenes[0]];

    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes: gapped, generatedBy }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes: short, generatedBy }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });

  it("rejects a storyboard that drops voice-over while the project needs it", async () => {
    const silent = scenes.map((scene) => ({ ...scene, voiceOver: null, caption: null }));

    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes: silent, generatedBy }, dependencies()))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });

  it("rejects a brief revision the caller does not own", async () => {
    const deps = dependencies();
    deps.briefRevisions.getOwned.mockResolvedValue(null);

    await expect(saveStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "storyboard@v1", briefRevisionId: BRIEF_ID, scenes, generatedBy }, deps))
      .rejects.toMatchObject({ code: "video_input_invalid" });
  });
});

describe("saveBriefRevision drafts", () => {
  it("accepts and stores a draft whose required fields are still empty", async () => {
    const draft = { ...brief, productName: null, audience: null, objective: null, keyMessage: null, callToAction: null };
    const deps = dependencies();

    const revision = await saveBriefRevision({ userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "video-brief-draft@v1", brief: draft, generatedBy, sourceMessageIds: [] }, deps);

    expect(revision.isComplete).toBe(false);
    expect(deps.briefRevisions.create.mock.calls[0]?.[0].brief).toEqual(draft);
    expect(deps.briefRevisions.create.mock.calls[0]?.[0].schemaVersion).toBe("video-brief-draft@v1");
  });

  it("never lets a caller declare its own draft complete", async () => {
    const deps = dependencies();

    const revision = await saveBriefRevision(
      { userId: USER_ID, projectId: PROJECT_ID, schemaVersion: "video-brief-draft@v1", brief: { ...brief, callToAction: null }, generatedBy, sourceMessageIds: [], isComplete: true } as never,
      deps,
    );

    expect(revision.isComplete).toBe(false);
  });
});

describe("video revision reads", () => {
  it("returns null before the first revision exists", async () => {
    const deps = dependencies();

    await expect(getLatestBriefRevision({ userId: USER_ID, projectId: PROJECT_ID }, deps)).resolves.toBeNull();
    await expect(getLatestStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID }, deps)).resolves.toBeNull();
  });

  it("returns the latest brief revision without the owner id", async () => {
    const deps = dependencies();
    deps.briefRevisions.latestOwned.mockResolvedValue(briefRevision());

    const result = await getLatestBriefRevision({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(result).toMatchObject({ id: BRIEF_ID, version: 1, schemaVersion: "brief@v1", isComplete: true, brief });
    expect(result).not.toHaveProperty("userId");
  });

  it("returns the latest storyboard revision with its approval time, and nothing internal", async () => {
    const deps = dependencies();
    deps.storyboardRevisions.latestOwned.mockResolvedValue(storyboardRevision());

    const result = await getLatestStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(result).toMatchObject({ id: "sb-1", version: 2, briefRevisionId: BRIEF_ID, totalDurationSeconds: 10, approvedAt: "approved" });
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("approvalSnapshot");
    expect(result).not.toHaveProperty("generatedBy");
  });

  it("omits the approval time for an unapproved storyboard", async () => {
    const deps = dependencies();
    deps.storyboardRevisions.latestOwned.mockResolvedValue({ ...storyboardRevision(), approvedAt: undefined });

    const result = await getLatestStoryboardRevision({ userId: USER_ID, projectId: PROJECT_ID }, deps);

    expect(result).not.toHaveProperty("approvedAt");
  });

  it("refuses a project the caller does not own", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);

    await expect(getLatestBriefRevision({ userId: USER_ID, projectId: PROJECT_ID }, deps))
      .rejects.toMatchObject({ code: "video_project_not_found" });
  });
});
