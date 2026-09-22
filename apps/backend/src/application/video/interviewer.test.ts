import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../../domain/ai-service/contracts";
import { AIError } from "../../domain/ai-service/errors";
import type { VideoOutputSettings, VideoMessage, VideoProject } from "../../domain/video/types";
import { runInterviewer } from "./interviewer";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

function project(overrides: Partial<VideoProject> = {}): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status: "interviewing", settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated", ...overrides };
}

function transcript(): VideoMessage[] {
  return [{ id: "m-1", projectId: PROJECT_ID, userId: USER_ID, role: "user", content: "buat video jualan kopi ini", controls: null, assetIds: [], createdAt: "created" }];
}

const draft = {
  productName: "Kopi Susu", productCategory: null, audience: null, objective: null, keyMessage: null,
  offer: null, callToAction: null, orderDestination: null, brandName: null,
  styleId: "bold_pop" as const, outputSettings: settings, menuItems: null, facts: [],
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

function dependencies(ai: AIService) {
  return { ai, createRequestId: () => "local-request-1" };
}

describe("runInterviewer", () => {
  it("returns the updated draft, the turn, and the provenance of the result", async () => {
    const ai = aiService({ draft, turn });

    const result = await runInterviewer(
      { userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 2 },
      dependencies(ai),
    );

    expect(result.draft).toEqual(draft);
    expect(result.turn).toEqual(turn);
    expect(result.generatedBy).toEqual({
      profileId: "primary", provider: "google", model: "gemini-2.0",
      promptVersion: "interviewer@v1", requestId: "local-request-1",
    });
  });

  it("asks the interviewer task with the project context and the registered schema", async () => {
    const ai = aiService({ draft, turn });

    await runInterviewer({ userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 2 }, dependencies(ai));

    const request = vi.mocked(ai.generateStructured).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      task: "interviewer",
      context: { userId: USER_ID, projectId: PROJECT_ID },
      promptVersion: "interviewer@v1",
      schema: { name: "interview_result", version: "v1" },
    });
    expect(request?.messages).toEqual([{ role: "user", content: "buat video jualan kopi ini" }]);
  });

  it("tells the model the required fields and the question language", async () => {
    const ai = aiService({ draft, turn });

    await runInterviewer({ userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 2 }, dependencies(ai));

    const instructions = vi.mocked(ai.generateStructured).mock.calls[0]?.[0].instructions ?? "";
    expect(instructions).toContain("productName, audience, objective, keyMessage, callToAction");
    expect(instructions).toContain("Bahasa Indonesia");
    expect(instructions).toContain("2");
  });

  it("rejects a turn that recommends an option it did not list", async () => {
    const ai = aiService({ draft, turn: { ...turn, recommendedOptionId: "missing" } });

    await expect(runInterviewer({ userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 0 }, dependencies(ai)))
      .rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("rejects a select turn with a single option", async () => {
    const ai = aiService({ draft, turn: { ...turn, options: [turn.options[0]], recommendedOptionId: null, recommendationReason: null } });

    await expect(runInterviewer({ userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 0 }, dependencies(ai)))
      .rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("propagates a provider failure unchanged", async () => {
    const ai = {
      generateText: vi.fn(),
      generateStructured: vi.fn(async () => {
        throw new AIError({ code: "AI_UNAVAILABLE", safeMessage: "AI service is unavailable.", requestId: "local-request-1", retryable: true });
      }),
    } as unknown as AIService;

    await expect(runInterviewer({ userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 0 }, dependencies(ai)))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
