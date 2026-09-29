import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../../domain/ai-service/contracts";
import { artDirectionSchema, type ArtDirection } from "../../domain/video-engine/art-direction";
import { PlanningError } from "../../domain/video-engine/errors";
import { createFsDesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";
import { recipeById } from "../../domain/video-engine/recipes/registry";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import { runArtDirector } from "./art-director";
import { ART_DIRECTOR_PROMPT_VERSION } from "./prompts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const brief: ValidationBrief = {
  productName: "Julumpia",
  brandName: "Julumpia",
  keyMessage: "Diskon 20% untuk semua menu",
  callToAction: "Pesan sekarang",
  orderDestination: null,
  audience: null,
  objective: null,
  productCategory: null,
  offer: { label: "Diskon 20%", detail: "Berlaku hari ini" },
  menuItems: null,
};

function designPack() {
  return createFsDesignPackSource(process.cwd()).load({ id: "creative-mode", version: "1" });
}

function direction(overrides: Partial<ArtDirection> = {}): ArtDirection {
  return {
    mainMessage: "Diskon 20%",
    visualFocus: "the product photo, full bleed",
    hierarchy: ["headline", "offer badge", "cta"],
    mood: "bold and warm",
    imageTreatment: "crop tight on the product",
    motionDirection: "short rises",
    beats: [
      { id: "hook", intent: "open on the product", emphasis: "high" },
      { id: "message", intent: "state the key message", emphasis: "high" },
      { id: "proof", intent: "hold on the product", emphasis: "medium" },
      { id: "cta", intent: "close on the call to action", emphasis: "medium" },
    ],
    ...overrides,
  };
}

function aiService(data: unknown): AIService {
  return {
    generateText: vi.fn(),
    generateStructured: vi.fn(async () => ({
      requestId: "ai-request-1",
      profileId: "primary",
      provider: "9router",
      model: "cx/gpt-5.6-luna",
      providerRequestId: "provider-1",
      attemptCount: 1,
      finishReason: "stop" as const,
      usage: { inputTokens: 900, outputTokens: 120, totalTokens: 1020 },
      estimatedCost: null,
      latencyMs: 1234,
      data,
    })),
  } as unknown as AIService;
}

async function command() {
  return {
    userId: USER_ID,
    projectId: PROJECT_ID,
    recipe: recipeById("product_promo"),
    brief,
    designPack: await designPack(),
    assets: [{ id: "asset-1", fileName: "product.jpg", mimeType: "image/jpeg" }],
    language: "id",
    durationSeconds: 12,
    aspectRatio: "9:16",
  };
}

describe("runArtDirector", () => {
  it("returns a validated direction with its provenance and cost metadata", async () => {
    const result = await runArtDirector(await command(), { ai: aiService(direction()), createRequestId: () => "local-request-1" });

    expect(result.artDirection).toEqual(direction());
    expect(result.generatedBy).toEqual({
      profileId: "primary",
      provider: "9router",
      model: "cx/gpt-5.6-luna",
      promptVersion: ART_DIRECTOR_PROMPT_VERSION,
      requestId: "local-request-1",
    });
    expect(result.ai.latencyMs).toBe(1234);
    expect(result.ai.usage.totalTokens).toBe(1020);
    expect(result.ai).not.toHaveProperty("data");
  });

  it("sends the recipe beats, the brief, and the design pack's frame.md to the art_director task", async () => {
    const ai = aiService(direction());

    await runArtDirector(await command(), { ai, createRequestId: () => "local-request-1" });

    const request = vi.mocked(ai.generateStructured).mock.calls[0][0];
    expect(request.task).toBe("art_director");
    expect(request.promptVersion).toBe(ART_DIRECTOR_PROMPT_VERSION);
    expect(request.schema.name).toBe("art_direction");
    expect(request.schema.version).toBe("v1");
    expect(request.context).toEqual({ userId: USER_ID, projectId: PROJECT_ID });
    expect(request.instructions).toContain("Creative Mode");
    for (const beat of recipeById("product_promo").beats) expect(request.instructions).toContain(`- ${beat.id}: ${beat.intent}`);
    expect(request.instructions).toContain("Diskon 20% untuk semua menu");
  });

  it("refuses a direction whose beats do not match the recipe", async () => {
    const mismatched = direction({
      beats: [{ id: "hook", intent: "open on the product", emphasis: "high" }],
    });

    await expect(runArtDirector(await command(), { ai: aiService(mismatched), createRequestId: () => "r" })).rejects.toMatchObject({
      name: "PlanningError",
      code: "art_direction_beat_mismatch",
    });
  });

  it("refuses a main message the brief cannot support", async () => {
    const promise = runArtDirector(await command(), {
      ai: aiService(direction({ mainMessage: "Diskon 50% hari ini" })),
      createRequestId: () => "r",
    });

    await expect(promise).rejects.toBeInstanceOf(PlanningError);
    await expect(promise).rejects.toMatchObject({ code: "art_direction_untraceable" });
  });
});

describe("art direction schema version", () => {
  it("is the schema the art director sends", () => {
    expect(ART_DIRECTOR_PROMPT_VERSION).toBe("art_director@v1");
    expect(artDirectionSchema.safeParse(direction()).success).toBe(true);
  });
});
