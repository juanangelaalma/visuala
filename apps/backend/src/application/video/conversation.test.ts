import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../../domain/ai-service/contracts";
import { AIError } from "../../domain/ai-service/errors";
import type { CreateStoryboardRevisionInput } from "../../domain/video/contracts";
import type { GeneratedBy, ProjectAsset, VideoDurationSeconds, VideoMessage, VideoOutputSettings, VideoProject, VideoStoryboardRevision } from "../../domain/video/types";
import { runVideoInterviewTurn } from "./conversation";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";

const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

const generatedBy: GeneratedBy = { profileId: "primary", provider: "google", model: "gemini-2.0", promptVersion: "interviewer@v1", requestId: "ai-request-1" };

const partialDraft = {
  productName: "Kopi Susu", productCategory: null, audience: null, objective: null, keyMessage: null,
  offer: null, callToAction: null, orderDestination: null, brandName: null,
  styleId: "bold_pop" as const, outputSettings: settings, menuItems: null, facts: [],
};

const completeDraft = {
  ...partialDraft,
  productCategory: "Minuman",
  audience: "Mahasiswa",
  objective: "Tambah pesanan",
  keyMessage: "Manisnya pas",
  callToAction: "Pesan sekarang",
};

const turn = {
  question: "Siapa target pembelinya?",
  control: "single_select" as const,
  options: [{ id: "students", label: "Mahasiswa", detail: null }, { id: "office", label: "Pekerja kantor", detail: null }],
  recommendedOptionId: "students",
  recommendationReason: "Produk manis dengan harga ramah cocok untuk mahasiswa.",
  targetFields: ["audience"],
  briefComplete: false,
};

const plan = {
  brief: completeDraft,
  storyboard: {
    scenes: [
      { order: 1, startSeconds: 0, endSeconds: 5, visual: "Produk di meja", onScreenTitle: "Kopi Susu", onScreenCopy: "Manisnya pas", voiceOver: "Coba kopi susu kami", caption: "Coba kopi susu kami", assetIds: [ASSET_ID], audioCue: null, transition: "fade" as const },
      { order: 2, startSeconds: 5, endSeconds: 10, visual: "Logo", onScreenTitle: "Pesan sekarang", onScreenCopy: "WhatsApp kami", voiceOver: "Pesan sekarang", caption: "Pesan sekarang", assetIds: [ASSET_ID], audioCue: null, transition: "cut" as const },
    ],
  },
};

function project(status: VideoProject["status"] = "interviewing"): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status, settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated" };
}

function asset(): ProjectAsset {
  return {
    id: ASSET_ID, projectId: PROJECT_ID, userId: USER_ID,
    objectKey: `video-projects/${PROJECT_ID}/${ASSET_ID}.png`,
    mimeType: "image/png", byteSize: 100, sha256: "0".repeat(64),
    width: 800, height: 800, rightsConfirmedAt: "confirmed",
    moderationStatus: "pending", createdAt: "created",
  };
}

function transcript(): VideoMessage[] {
  return [{ id: "m-1", projectId: PROJECT_ID, userId: USER_ID, role: "user", content: "buat video jualan kopi ini", controls: null, assetIds: [], createdAt: "created" }];
}

function aiService(options: { responses?: Record<string, unknown>; failure?: AIError } = {}): AIService {
  const responses = options.responses ?? { interviewer: { draft: partialDraft, turn }, planner: plan };
  return {
    generateText: vi.fn(),
    generateStructured: vi.fn(async (request: { task: string }) => {
      if (options.failure) throw options.failure;
      return {
        requestId: "ai-request-1", profileId: "primary", provider: "google", model: "gemini-2.0",
        providerRequestId: "provider-1", attemptCount: 1, finishReason: "stop" as const,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, estimatedCost: null, latencyMs: 20,
        data: responses[request.task],
      };
    }),
  } as unknown as AIService;
}

function dependencies(options: {
  project?: VideoProject;
  assets?: ProjectAsset[];
  responses?: Record<string, unknown>;
  failure?: AIError;
} = {}) {
  const currentProject = options.project ?? project();
  const briefRevision = { id: BRIEF_ID, projectId: PROJECT_ID, userId: USER_ID, version: 1, schemaVersion: "v1", brief: completeDraft, isComplete: true, generatedBy, sourceMessageIds: [], createdAt: "created" };

  return {
    projects: {
      getOwned: vi.fn(async (): Promise<VideoProject | null> => currentProject),
      transition: vi.fn(async (_projectId: string, _userId: string, _from: string, to: VideoProject["status"]) => ({ ...currentProject, status: to })),
    },
    assets: { listOwned: vi.fn(async (): Promise<ProjectAsset[]> => options.assets ?? [asset()]) },
    messages: {
      append: vi.fn(async (input: { id: string; projectId: string; userId: string; role: VideoMessage["role"]; content: string; controls?: unknown; assetIds?: string[] }): Promise<VideoMessage> => ({
        id: input.id, projectId: input.projectId, userId: input.userId, role: input.role,
        content: input.content, controls: input.controls ?? null, assetIds: input.assetIds ?? [], createdAt: "created",
      })),
      listOwned: vi.fn(async (): Promise<VideoMessage[]> => transcript()),
    },
    briefRevisions: {
      create: vi.fn(async (input: { [key: string]: unknown }): Promise<typeof briefRevision> => ({ ...briefRevision, ...input })),
      latestOwned: vi.fn(async (): Promise<typeof briefRevision | null> => null),
      getOwned: vi.fn(async (): Promise<typeof briefRevision | null> => briefRevision),
    },
    storyboardRevisions: {
      create: vi.fn(async (input: CreateStoryboardRevisionInput): Promise<VideoStoryboardRevision> => ({
        id: "sb-1", projectId: input.projectId, userId: input.userId, version: 1, schemaVersion: input.schemaVersion,
        briefRevisionId: input.briefRevisionId, scenes: input.scenes,
        totalDurationSeconds: input.totalDurationSeconds as VideoDurationSeconds,
        generatedBy: input.generatedBy as GeneratedBy, createdAt: "created",
      })),
    },
    ai: aiService(options),
    createId: () => "generated-id",
  };
}

describe("runVideoInterviewTurn", () => {
  it("stores a draft revision and the next question while the brief is unfinished", async () => {
    const deps = dependencies();

    const result = await runVideoInterviewTurn({ userId: USER_ID, projectId: PROJECT_ID, content: "buat video jualan kopi ini" }, deps);

    expect(deps.briefRevisions.create).toHaveBeenCalledOnce();
    expect(deps.briefRevisions.create.mock.calls[0]?.[0]).toMatchObject({ schemaVersion: "video-brief-draft@v1", isComplete: false });
    expect(deps.storyboardRevisions.create).not.toHaveBeenCalled();
    expect(deps.projects.transition).not.toHaveBeenCalled();
    expect(result.reply.controls).toEqual(turn);
    expect(result.reply.role).toBe("assistant");
    expect(result.project.status).toBe("interviewing");
    expect(vi.mocked(deps.ai.generateStructured)).toHaveBeenCalledOnce();
  });

  it("writes the user message before it asks the model", async () => {
    const deps = dependencies();

    await runVideoInterviewTurn({ userId: USER_ID, projectId: PROJECT_ID, content: "buat video jualan kopi ini" }, deps);

    const userAppend = deps.messages.append.mock.invocationCallOrder[0];
    const modelCall = vi.mocked(deps.ai.generateStructured).mock.invocationCallOrder[0];
    expect(userAppend).toBeLessThan(modelCall ?? Number.POSITIVE_INFINITY);
  });

  it("plans the brief and storyboard and opens approval once the draft is complete and an asset exists", async () => {
    const deps = dependencies({ responses: { interviewer: { draft: completeDraft, turn: null }, planner: plan } });

    const result = await runVideoInterviewTurn({ userId: USER_ID, projectId: PROJECT_ID, content: "sudah lengkap" }, deps);

    expect(vi.mocked(deps.ai.generateStructured).mock.calls.map((call) => (call[0] as { task: string }).task)).toEqual(["interviewer", "planner"]);
    expect(deps.briefRevisions.create.mock.calls[0]?.[0]).toMatchObject({ schemaVersion: "v1", isComplete: true });
    expect(deps.storyboardRevisions.create).toHaveBeenCalledOnce();
    expect(deps.storyboardRevisions.create.mock.calls[0]?.[0]).toMatchObject({ totalDurationSeconds: 10, briefRevisionId: BRIEF_ID });
    expect(deps.projects.transition).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "interviewing", "awaiting_approval");
    expect(result.project.status).toBe("awaiting_approval");
    expect(result.reply.controls).toBeNull();
  });

  it("keeps the brief but asks for a photo when a complete brief has no asset to reference", async () => {
    const deps = dependencies({ assets: [], responses: { interviewer: { draft: completeDraft, turn: null } } });

    const result = await runVideoInterviewTurn({ userId: USER_ID, projectId: PROJECT_ID, content: "sudah lengkap" }, deps);

    expect(vi.mocked(deps.ai.generateStructured)).toHaveBeenCalledOnce();
    expect(deps.storyboardRevisions.create).not.toHaveBeenCalled();
    expect(deps.projects.transition).not.toHaveBeenCalled();
    expect(result.reply.content).toContain("Unggah");
    expect(result.project.status).toBe("interviewing");
  });

  it("refuses a turn on a project that can no longer change its brief", async () => {
    const deps = dependencies({ project: project("rendering") });

    await expect(runVideoInterviewTurn({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps))
      .rejects.toMatchObject({ code: "video_state_conflict" });

    expect(deps.messages.append).not.toHaveBeenCalled();
    expect(vi.mocked(deps.ai.generateStructured)).not.toHaveBeenCalled();
  });

  it("keeps the user message but writes no revision when the provider fails", async () => {
    const deps = dependencies({ failure: new AIError({ code: "AI_UNAVAILABLE", safeMessage: "AI service is unavailable.", requestId: "ai-request-1", retryable: true }) });

    await expect(runVideoInterviewTurn({ userId: USER_ID, projectId: PROJECT_ID, content: "buat video jualan kopi ini" }, deps))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });

    expect(deps.messages.append).toHaveBeenCalledOnce();
    expect(deps.briefRevisions.create).not.toHaveBeenCalled();
    expect(deps.storyboardRevisions.create).not.toHaveBeenCalled();
  });

  it("refuses a project that is not the caller's", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);

    await expect(runVideoInterviewTurn({ userId: USER_ID, projectId: PROJECT_ID, content: "halo" }, deps))
      .rejects.toMatchObject({ code: "video_project_not_found" });
  });
});
