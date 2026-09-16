import { describe, expect, it, vi } from "vitest";
import { AIError } from "@/domain/ai-service/errors";
import { ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type { CreativeProjectAggregate } from "@/domain/creative-video/types";
import { analyzeCreativeProject } from "./analyze-project";

describe("analyzeCreativeProject", () => {
  it("persists an immutable brief and transitions to needs_input when required facts remain", async () => {
    const dependencies = makeDependencies();

    const result = await analyzeCreativeProject(dependencies, input());

    expect(dependencies.projects.applyBriefAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({ id: "brief-1", projectId: "project-1", sourceProjectRevision: 3,
        goal: "Pesan lewat WhatsApp", product: "unknown", assetIds: ["asset-1"], pluginSchemaVersion: "v1",
        missingRequiredQuestions: ["Nomor WhatsApp mana?"] }),
      userId: "user-1", expectedRevision: 3, state: "needs_input",
    }));
    expect(dependencies.concepts.generate).not.toHaveBeenCalled();
    expect(result.state).toBe("needs_input");
  });

  it("hands a sufficient immutable brief to the injected concept boundary", async () => {
    const dependencies = makeDependencies({ missingRequired: [], sufficient: true });

    const result = await analyzeCreativeProject(dependencies, input());

    expect(dependencies.concepts.generate).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({ id: "project-1" }),
      brief: expect.objectContaining({ id: "brief-1", sourceProjectRevision: 3 }),
    }));
    expect(dependencies.projects.applyBriefAnalysis).toHaveBeenCalledWith(expect.objectContaining({ state: "analyzing" }));
    expect(result.state).toBe("concept_generation_started");
  });

  it("rejects analysis when the source revision became stale", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.applyBriefAnalysis.mockRejectedValue(new ProjectRevisionConflictError());

    await expect(analyzeCreativeProject(dependencies, input())).rejects.toBeInstanceOf(ProjectRevisionConflictError);
    expect(dependencies.concepts.generate).not.toHaveBeenCalled();
  });

  it("does not persist or transition an insufficient stale analysis during a race", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.applyBriefAnalysis.mockRejectedValue(new ProjectRevisionConflictError());

    await expect(analyzeCreativeProject(dependencies, input())).rejects.toBeInstanceOf(ProjectRevisionConflictError);

    expect(dependencies.concepts.generate).not.toHaveBeenCalled();
  });

  it("does not invoke concept generation when a sufficient analysis loses the revision claim", async () => {
    const dependencies = makeDependencies({ missingRequired: [], sufficient: true });
    dependencies.projects.applyBriefAnalysis.mockRejectedValue(new ProjectRevisionConflictError());

    await expect(analyzeCreativeProject(dependencies, input())).rejects.toBeInstanceOf(ProjectRevisionConflictError);

    expect(dependencies.concepts.generate).not.toHaveBeenCalled();
  });

  it("maps AI failures to safe creative-video errors", async () => {
    const dependencies = makeDependencies();
    dependencies.interpreter.interpret.mockRejectedValue(new AIError({
      code: "AI_INVALID_OUTPUT", safeMessage: "secret provider detail", requestId: "analysis-1", retryable: false,
    }));

    await expect(analyzeCreativeProject(dependencies, input())).rejects.toMatchObject({
      code: "ANALYSIS_INVALID_OUTPUT", safeMessage: "We could not analyze this creative brief. Please try again.",
    });
  });

  it("loads a persisted clarification answer into the real interpreter context", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.getOwnedProject.mockResolvedValue({
      ...aggregate(4),
      brief: previousBrief(),
      messages: [
        ...aggregate(4).messages,
        { id: "answer-1", projectId: "project-1", role: "user", kind: "answer", text: "Diskon 20%", assetId: null, projectRevision: 4, idempotencyKey: "answer-1", createdAt: "2026-09-15T00:01:00.000Z" },
      ],
    });

    await analyzeCreativeProject(dependencies, { ...input(), sourceRevision: 4, previousBrief: previousBrief() });

    expect(dependencies.interpreter.interpret).toHaveBeenCalledWith(expect.objectContaining({
      assetId: "asset-1",
      previousBrief: expect.objectContaining({ id: "previous-brief" }),
      messages: [
        { role: "user", text: "Pesan lewat WhatsApp", assetId: "asset-1" },
        { role: "user", text: "Diskon 20%", assetId: null },
      ],
    }));
  });
});

function input() {
  return { userId: "user-1", projectId: "project-1", sourceRevision: 3, requestId: "analysis-1" };
}

function makeDependencies(analysisOverrides: Record<string, unknown> = {}) {
  const analysis = {
    goal: "Pesan lewat WhatsApp",
    product: { name: null, category: "food", confidence: 0.9 },
    facts: [], assumptions: [],
    missingRequired: [{ factKey: "whatsapp_contact", question: "Nomor WhatsApp mana?" }],
    optionalQuestions: [], sufficient: false,
    ...analysisOverrides,
  };
  return {
    projects: {
      getOwnedProject: vi.fn().mockResolvedValue(aggregate(3)),
      applyBriefAnalysis: vi.fn().mockImplementation(async ({ state }) => ({ ...aggregate(4).project, state, revision: 4 })),
    },
    interpreter: { interpret: vi.fn().mockResolvedValue({ analysis, generation: { requestId: "analysis-1", promptVersion: "fnb-interviewer-v1", model: "model-1" }, schemaVersion: "v1" }) },
    concepts: { generate: vi.fn().mockResolvedValue(undefined) },
    createId: vi.fn().mockReturnValue("brief-1"),
    now: vi.fn().mockReturnValue(new Date("2026-09-15T00:00:00.000Z")),
  };
}

function aggregate(revision: number): CreativeProjectAggregate {
  return {
    project: { id: "project-1", userId: "user-1", createIdempotencyKey: "create-1", category: { id: "fnb", version: "1" }, state: "analyzing", revision, assetId: "asset-1", activeConceptId: null, activeCompositionVersionId: null, failedStage: null, errorCode: null, previewGenerationCount: 0, previewQuota: 3, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" },
    messages: [
      { id: "message-1", projectId: "project-1", role: "user", kind: "brief", text: "Pesan lewat WhatsApp", assetId: "asset-1", projectRevision: 3, idempotencyKey: "create-1", createdAt: "2026-09-15T00:00:00.000Z" },
    ], brief: null, concepts: [],
  };
}

function previousBrief() {
  return { id: "previous-brief", projectId: "project-1", goal: "Promo", product: "Keripik", facts: [], assumptions: [], missingRequiredQuestions: ["Berapa diskonnya?"], optionalQuestions: [], assetIds: ["asset-1"], pluginSchemaVersion: "v1", sourceProjectRevision: 3, createdAt: "2026-09-15T00:00:30.000Z" };
}
