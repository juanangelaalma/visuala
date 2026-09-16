import { describe, expect, it, vi } from "vitest";
import { ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type { BriefSnapshot, CreativeProject } from "@/domain/creative-video/types";
import { generateCreativeConcepts } from "./generate-concepts";

describe("generateCreativeConcepts", () => {
  it("atomically persists all concepts and transitions the claimed revision", async () => {
    const dependencies = makeDependencies();
    await generateCreativeConcepts(dependencies, input());
    expect(dependencies.projects.applyConceptGeneration).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", expectedRevision: 4, sourceBriefRevision: 3,
      concepts: [expect.objectContaining({ id: "stored-1", order: 1 }), expect.objectContaining({ id: "stored-2", order: 2 }), expect.objectContaining({ id: "stored-3", order: 3 })],
    }));
  });

  it("discards stale completion without falling back to separate writes", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.applyConceptGeneration.mockRejectedValue(new ProjectRevisionConflictError());
    await expect(generateCreativeConcepts(dependencies, input())).resolves.toEqual({ status: "stale" });
    expect(dependencies.projects.applyConceptGeneration).toHaveBeenCalledTimes(1);
  });

  it("propagates non-stale persistence failures", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.applyConceptGeneration.mockRejectedValue(new Error("database unavailable"));
    await expect(generateCreativeConcepts(dependencies, input())).rejects.toThrow("database unavailable");
  });
});

function input() {
  return { project: project(), brief: brief(), requestId: "concept-request-1" };
}

function makeDependencies() {
  return {
    projects: { applyConceptGeneration: vi.fn().mockResolvedValue({ ...project(), state: "concepts_ready", revision: 5 }) },
    planner: { generateConcepts: vi.fn().mockResolvedValue({ concepts: generatedConcepts(), generation: { requestId: "concept-request-1", promptVersion: "fnb-concepts-v1", model: "model-1" } }) },
    createId: vi.fn().mockReturnValueOnce("stored-1").mockReturnValueOnce("stored-2").mockReturnValueOnce("stored-3"),
    now: vi.fn().mockReturnValue(new Date("2026-09-15T01:00:00.000Z")),
  };
}

function generatedConcepts() {
  return [1, 2, 3].map((order) => ({ id: `ai-${order}`, title: `Title ${order}`, hook: `Hook ${order}`, angle: `Angle ${order}`, sceneOutline: [`A${order}`, `B${order}`, `C${order}`, `D${order}`] as [string, string, string, string], fitReason: `Fit ${order}`, recommendationReason: `Reason ${order}`, recommended: order === 1 }));
}

function project(): CreativeProject {
  return { id: "project-1", userId: "user-1", createIdempotencyKey: "create-1", category: { id: "fnb", version: "1" }, state: "analyzing", revision: 4, assetId: "asset-1", activeConceptId: null, activeCompositionVersionId: null, failedStage: null, errorCode: null, previewGenerationCount: 0, previewQuota: 3, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" };
}

function brief(): BriefSnapshot {
  return { id: "brief-1", projectId: "project-1", goal: "Promosikan camilan", product: "Keripik", facts: [], assumptions: [], missingRequiredQuestions: [], optionalQuestions: [], assetIds: ["asset-1"], pluginSchemaVersion: "v1", sourceProjectRevision: 3, createdAt: "2026-09-15T00:00:00.000Z" };
}
