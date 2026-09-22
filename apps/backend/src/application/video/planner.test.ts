import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../../domain/ai-service/contracts";
import { AIError } from "../../domain/ai-service/errors";
import type { VideoMessage, VideoOutputSettings, VideoProject } from "../../domain/video/types";
import { runPlanner } from "./planner";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

const brief = {
  productName: "Kopi Susu Gula Aren", productCategory: "Minuman", audience: "Mahasiswa", objective: "Tambah pesanan",
  keyMessage: "Manisnya pas", offer: null, callToAction: "Pesan sekarang", orderDestination: null, brandName: null,
  styleId: "bold_pop" as const, outputSettings: settings, menuItems: null, facts: [],
};

const storyboard = {
  scenes: [
    { order: 1, startSeconds: 0, endSeconds: 5, visual: "Produk di meja", onScreenTitle: "Kopi Susu", onScreenCopy: "Manisnya pas", voiceOver: "Coba kopi susu kami", caption: "Coba kopi susu kami", assetIds: [ASSET_ID], audioCue: null, transition: "fade" as const },
    { order: 2, startSeconds: 5, endSeconds: 10, visual: "Logo", onScreenTitle: "Pesan sekarang", onScreenCopy: "WhatsApp kami", voiceOver: "Pesan sekarang", caption: "Pesan sekarang", assetIds: [ASSET_ID], audioCue: null, transition: "cut" as const },
  ],
};

function project(): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status: "awaiting_approval", settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated" };
}

function transcript(): VideoMessage[] {
  return [{ id: "m-1", projectId: PROJECT_ID, userId: USER_ID, role: "user", content: "buat video jualan kopi ini", controls: null, assetIds: [], createdAt: "created" }];
}

function aiService(data: unknown): AIService {
  return {
    generateText: vi.fn(),
    generateStructured: vi.fn(async () => ({
      requestId: "ai-request-1", profileId: "primary", provider: "google", model: "gemini-2.0",
      providerRequestId: "provider-1", attemptCount: 1, finishReason: "stop" as const,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, estimatedCost: null, latencyMs: 20, data,
    })),
  } as unknown as AIService;
}

describe("runPlanner", () => {
  it("returns the brief, the storyboard, and the provenance of the plan", async () => {
    const ai = aiService({ brief, storyboard });

    const result = await runPlanner(
      { userId: USER_ID, project: project(), transcript: transcript(), brief, assetIds: [ASSET_ID] },
      { ai, createRequestId: () => "local-request-1" },
    );

    expect(result.brief).toEqual(brief);
    expect(result.storyboard).toEqual(storyboard);
    expect(result.generatedBy).toEqual({
      profileId: "primary", provider: "google", model: "gemini-2.0",
      promptVersion: "planner@v1", requestId: "local-request-1",
    });
  });

  it("asks the planner task with the duration, the asset ids, and the registered schema", async () => {
    const ai = aiService({ brief, storyboard });

    await runPlanner(
      { userId: USER_ID, project: project(), transcript: transcript(), brief, assetIds: [ASSET_ID] },
      { ai, createRequestId: () => "local-request-1" },
    );

    const request = vi.mocked(ai.generateStructured).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      task: "planner",
      context: { userId: USER_ID, projectId: PROJECT_ID },
      promptVersion: "planner@v1",
      schema: { name: "video_plan", version: "v1" },
    });
    expect(request?.instructions).toContain("exactly 10 seconds");
    expect(request?.instructions).toContain(ASSET_ID);
  });

  it("propagates a provider failure unchanged", async () => {
    const ai = {
      generateText: vi.fn(),
      generateStructured: vi.fn(async () => {
        throw new AIError({ code: "AI_REFUSED", safeMessage: "AI provider refused the request.", requestId: "local-request-1", retryable: false });
      }),
    } as unknown as AIService;

    await expect(runPlanner(
      { userId: USER_ID, project: project(), transcript: transcript(), brief, assetIds: [ASSET_ID] },
      { ai, createRequestId: () => "local-request-1" },
    )).rejects.toMatchObject({ code: "AI_REFUSED" });
  });
});
