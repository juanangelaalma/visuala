import { describe, expect, it, vi } from "vitest";
import type { AIService } from "@/domain/ai-service/contracts";
import type { CategoryPlugin } from "@/domain/creative-video/contracts";
import type { VideoPlan } from "@/domain/creative-video/types";
import { z } from "zod";
import { AIServiceBriefInterpreter } from "./ai-service-brief-interpreter";
import { applyFnbFactPolicy } from "./plugins/categories/fnb/fnb-interviewer";

describe("AIServiceBriefInterpreter", () => {
  it("calls the interviewer task with project context and owned asset", async () => {
    const ai = aiService();
    const plugin = categoryPlugin();
    const plugins = { resolveCategory: vi.fn().mockReturnValue(plugin) };
    const interpreter = new AIServiceBriefInterpreter(ai, plugins);

    await interpreter.interpret(input());

    expect(ai.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "analysis-1",
      task: "interviewer",
      context: { userId: "user-1", projectId: "project-1" },
      promptVersion: "fnb-interviewer-v1",
      instructions: "trusted plugin instructions",
      schema: { name: "fnb-brief-analysis", version: "v1", schema: plugin.brief.schema },
      messages: [
        { role: "user", content: "Buat promo produk", assetId: "asset-1" },
        { role: "assistant", content: "Berapa diskonnya?" },
        { role: "user", content: "20 persen" },
      ],
    }));
    expect(plugins.resolveCategory).toHaveBeenCalledWith({ id: "fnb", version: "1" });
  });

  it("applies deterministic policy after structured generation", async () => {
    const ai = aiService({ goal: "AI-safe goal", sufficient: true });
    const interpreter = new AIServiceBriefInterpreter(ai, { resolveCategory: vi.fn().mockReturnValue(categoryPlugin()) });

    const result = await interpreter.interpret({ ...input(), messages: [{ role: "user", text: "Pesan lewat WhatsApp", assetId: "asset-1" }] });

    expect(result.analysis.missingRequired).toContainEqual(expect.objectContaining({ factKey: "whatsapp_contact" }));
    expect(result.analysis.sufficient).toBe(false);
  });

  it("includes prior facts when reinterpreting a clarification answer", async () => {
    const ai = aiService();
    const interpreter = new AIServiceBriefInterpreter(ai, { resolveCategory: vi.fn().mockReturnValue(categoryPlugin()) });

    await interpreter.interpret({
      ...input(),
      previousBrief: {
        id: "brief-1", projectId: "project-1", goal: "Buat promo", product: "Keripik",
        facts: [{ id: "product_name", value: "Keripik", provenance: "user" }], assumptions: ["Tujuan penjualan"],
        missingRequiredQuestions: ["Berapa diskonnya?"], optionalQuestions: [], assetIds: ["asset-1"],
        pluginSchemaVersion: "v1", sourceProjectRevision: 3, createdAt: "2026-09-15T00:00:00.000Z",
      },
    });

    expect(ai.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      instructions: expect.stringContaining('"product_name"'),
    }));
  });
});

function input() {
  return {
    requestId: "analysis-1",
    userId: "user-1",
    projectId: "project-1",
    category: { id: "fnb", version: "1" },
    assetId: "asset-1",
    messages: [
      { role: "user" as const, text: "Buat promo produk", assetId: "asset-1" },
      { role: "assistant" as const, text: "Berapa diskonnya?", assetId: null },
      { role: "user" as const, text: "20 persen", assetId: null },
    ],
  };
}

function categoryPlugin(): CategoryPlugin {
  return {
    ref: { id: "fnb", version: "1" }, supportedAssetRoles: [],
    brief: { schema: z.unknown(), schemaVersion: "v1", interviewerInstructions: "trusted plugin instructions", interviewerPromptVersion: "fnb-interviewer-v1", requiredFacts: [], optionalFacts: [], postValidate: (brief, messages) => applyFnbFactPolicy(brief as never, messages) },
    plan: { schema: z.custom<VideoPlan>(), schemaVersion: "v1", plannerInstructions: "", plannerPromptVersion: "", constraints: [] },
    supportedStyleCapabilities: [], testFixtures: [], acceptanceExamples: [],
  };
}

function aiService(overrides: Record<string, unknown> = {}) {
  const data = {
    goal: "Buat promo produk",
    product: { name: null, category: "food", confidence: 0.9 },
    facts: [], assumptions: [], missingRequired: [], optionalQuestions: [], sufficient: true,
    ...overrides,
  };
  return {
    generateText: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue({ data, requestId: "analysis-1", model: "model-1" }),
  } as unknown as AIService & { generateStructured: ReturnType<typeof vi.fn> };
}
