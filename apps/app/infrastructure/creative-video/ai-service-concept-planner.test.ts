import { describe, expect, it, vi } from "vitest";
import type { AIService } from "@/domain/ai-service/contracts";
import { fnbCategoryPlugin } from "./plugins/categories/fnb/fnb-category-plugin";
import { fnbConceptSetSchema } from "./plugins/categories/fnb/fnb-concept-schema";
import { AIServiceConceptPlanner } from "./ai-service-concept-planner";

describe("F&B concept schema", () => {
  it("requires exactly three concepts", () => {
    expect(fnbConceptSetSchema.safeParse({ concepts: validConcepts().slice(0, 2) }).success).toBe(false);
    expect(fnbConceptSetSchema.safeParse({ concepts: validConcepts() }).success).toBe(true);
  });

  it("requires exactly one recommendation", () => {
    const concepts = validConcepts().map((concept) => ({ ...concept, recommended: true }));
    expect(fnbConceptSetSchema.safeParse({ concepts }).success).toBe(false);
  });

  it("requires exactly four non-empty scene outline entries", () => {
    const concepts = validConcepts();
    concepts[0] = { ...concepts[0], sceneOutline: concepts[0].sceneOutline.slice(0, 3) };
    expect(fnbConceptSetSchema.safeParse({ concepts }).success).toBe(false);
  });

  it.each([
    ["hooks", { hook: "  CRISPY—NOW!  " }, { hook: "crispy now" }],
    ["angles", { angle: "Close-up & Crunch" }, { angle: "close up crunch" }],
  ])("rejects normalized duplicate %s", (_label, firstPatch, secondPatch) => {
    const concepts = validConcepts();
    concepts[0] = { ...concepts[0], ...firstPatch };
    concepts[1] = { ...concepts[1], ...secondPatch };
    expect(fnbConceptSetSchema.safeParse({ concepts }).success).toBe(false);
  });

  it("rejects normalized duplicate scene outlines across concepts", () => {
    const concepts = validConcepts();
    concepts[1] = { ...concepts[1], sceneOutline: ["  PRODUCT—REVEAL! ", ...concepts[1].sceneOutline.slice(1)] };
    expect(fnbConceptSetSchema.safeParse({ concepts }).success).toBe(false);
  });

  it("rejects guaranteed-sales wording including pasti laku", () => {
    const concepts = validConcepts();
    concepts[2] = { ...concepts[2], fitReason: "Promosi ini pasti laku." };
    expect(fnbConceptSetSchema.safeParse({ concepts }).success).toBe(false);
  });
});

describe("AIServiceConceptPlanner", () => {
  it("uses the Category-owned planner contract and stable schema key", async () => {
    const ai = aiService();
    const planner = new AIServiceConceptPlanner(ai, { resolveCategory: vi.fn().mockReturnValue(fnbCategoryPlugin) });

    await planner.generateConcepts(plannerInput());

    expect(ai.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "concept-request-1",
      task: "planner",
      context: { userId: "user-1", projectId: "project-1" },
      instructions: fnbCategoryPlugin.plan.plannerInstructions,
      promptVersion: "fnb-concepts-v1",
      schema: { name: "fnb-concept-set", version: "v1", schema: fnbCategoryPlugin.plan.schema },
    }));
  });

  it("returns validated concepts with generation metadata", async () => {
    const planner = new AIServiceConceptPlanner(aiService(), { resolveCategory: vi.fn().mockReturnValue(fnbCategoryPlugin) });
    const result = await planner.generateConcepts(plannerInput());
    expect(result).toMatchObject({ concepts: validConcepts(), generation: { requestId: "concept-request-1", promptVersion: "fnb-concepts-v1", model: "model-1" } });
  });
});

function validConcepts() {
  return [
    concept("concept-1", "Sensasi Renyah", "Sekali gigit langsung kriuk", "Close-up tekstur", ["Product reveal", "Crunch moment", "Offer detail", "WhatsApp CTA"], true),
    concept("concept-2", "Teman Santai", "Camilan untuk waktu santai", "Momen kebersamaan", ["Relaxed opening", "Friends share", "Price display", "Order prompt"], false),
    concept("concept-3", "Promo Cepat", "Lihat penawaran hari ini", "Informasi promo", ["Bold title", "Food showcase", "Promotion period", "Contact close"], false),
  ];
}

function concept(id: string, title: string, hook: string, angle: string, sceneOutline: string[], recommended: boolean) {
  return { id, title, hook, angle, sceneOutline, fitReason: `Cocok untuk ${title}`, recommendationReason: recommended ? "Paling kuat secara visual" : "Alternatif kreatif", recommended };
}

function plannerInput() {
  return {
    requestId: "concept-request-1", userId: "user-1", projectId: "project-1", category: { id: "fnb", version: "1" },
    brief: { id: "brief-1", projectId: "project-1", goal: "Promosikan camilan", product: "Keripik", facts: [], assumptions: [], missingRequiredQuestions: [], optionalQuestions: [], assetIds: ["asset-1"], pluginSchemaVersion: "v1", sourceProjectRevision: 3, createdAt: "2026-09-15T00:00:00.000Z" },
  };
}

function aiService() {
  return { generateText: vi.fn(), generateStructured: vi.fn().mockResolvedValue({ data: { concepts: validConcepts() }, requestId: "concept-request-1", model: "model-1" }) } as unknown as AIService & { generateStructured: ReturnType<typeof vi.fn> };
}
