import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../../domain/ai-service/contracts";
import { AIError } from "../../domain/ai-service/errors";
import type { VideoOutputSettings, VideoMessage, VideoProject } from "../../domain/video/types";
import type { StructuredResult } from "../../domain/ai-service/types";
import { runInterviewer } from "./interviewer";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const settings: VideoOutputSettings = { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true };

function project(overrides: Partial<VideoProject> = {}): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "creative-mode", status: "interviewing", settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated", ...overrides };
}

function transcript(): VideoMessage[] {
  return [{ id: "m-1", projectId: PROJECT_ID, userId: USER_ID, role: "user", content: "buat video jualan kopi ini", controls: null, assetIds: [], createdAt: "created" }];
}

const draft = {
  productName: "Kopi Susu", productCategory: null, audience: null, objective: null, keyMessage: null,
  offer: null, callToAction: null, orderDestination: null, brandName: null,
  styleId: "creative-mode" as const, outputSettings: settings, menuItems: null, facts: [],
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

function structuredResult(data: unknown): StructuredResult<unknown> {
  return {
    requestId: "ai-request-1", profileId: "primary", provider: "google", model: "gemini-2.0",
    providerRequestId: "provider-1", attemptCount: 1, finishReason: "stop",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, estimatedCost: null, latencyMs: 20, data,
  };
}

function aiService(data: unknown): AIService {
  return {
    generateText: vi.fn(),
    generateStructured: vi.fn(async () => structuredResult(data)),
  } as unknown as AIService;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
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
      promptVersion: "interviewer@v2", requestId: "local-request-1",
    });
  });

  it("publishes only question text while the structured result is still pending", async () => {
    const ai = aiService({ draft, turn });
    const preview = deferred<void>();
    const deltas: string[] = [];
    const release = deferred<void>();
    let settled = false;
    vi.mocked(ai.generateStructured).mockImplementationOnce(async (request) => {
      request.onTextDelta?.('{"draft":{"question":"not the question"},"turn":{"question":"Siapa target ');
      await release.promise;
      return structuredResult({ draft, turn });
    });

    const pending = runInterviewer(
      { userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 2 },
      dependencies(ai),
      { onQuestionDelta: (delta) => { deltas.push(delta); preview.resolve(); } },
    ).then((result) => { settled = true; return result; });

    await preview.promise;
    expect(deltas.join("")).toBe("Siapa target ");
    expect(settled).toBe(false);
    release.resolve();
    expect((await pending).turn).toEqual(turn);
  });

  it("rejects invalid final controls even after a question preview", async () => {
    const ai = aiService({ draft, turn });
    const deltas: string[] = [];
    vi.mocked(ai.generateStructured).mockImplementationOnce(async (request) => {
      request.onTextDelta?.('{"turn":{"question":"Siapa target pembelinya?"}}');
      return structuredResult({ draft, turn: { ...turn, recommendedOptionId: "missing" } });
    });

    await expect(runInterviewer(
      { userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 0 },
      dependencies(ai),
      { onQuestionDelta: (delta) => deltas.push(delta) },
    )).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(deltas.join("")).toBe(turn.question);
  });

  it("does not start generation after cancellation", async () => {
    const ai = aiService({ draft, turn });
    const controller = new AbortController();
    controller.abort();

    await expect(runInterviewer(
      { userId: USER_ID, project: project(), transcript: transcript(), draft: null, assetCount: 0 },
      dependencies(ai),
      { abortSignal: controller.signal },
    )).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect(ai.generateStructured).not.toHaveBeenCalled();
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
