import { describe, expect, it, vi } from "vitest";
import { AIError } from "@/domain/ai-service/errors";
import { ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type { BriefSnapshot, CreativeProjectAggregate } from "@/domain/creative-video/types";
import { answerCreativeVideoClarification } from "./answer-clarification";

describe("answerCreativeVideoClarification", () => {
  it("appends an answer and reanalyzes ordered context with the prior brief and original asset", async () => {
    const dependencies = makeDependencies();

    await answerCreativeVideoClarification(dependencies, input());

    expect(dependencies.projects.persistClarificationAnswer).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1", userId: "user-1", expectedRevision: 3,
      message: expect.objectContaining({ id: "message-2", projectRevision: 4, idempotencyKey: "answer-1" }),
    }));
    expect(dependencies.analyze).toHaveBeenCalledWith(dependencies, expect.objectContaining({
      sourceRevision: 4, previousBrief: expect.objectContaining({ id: "brief-1" }),
    }));
  });

  it("does not duplicate an answer idempotency key", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.persistClarificationAnswer.mockResolvedValue({ status: "duplicate", project: aggregate({ state: "analyzing", revision: 4 }).project });

    const result = await answerCreativeVideoClarification(dependencies, input());

    expect(dependencies.projects.persistClarificationAnswer).toHaveBeenCalledOnce();
    expect(dependencies.analyze).not.toHaveBeenCalled();
    expect(result).toEqual({ state: "analyzing", revision: 4, duplicate: true });
  });

  it("rejects duplicate answers submitted with a stale revision", async () => {
    const dependencies = makeDependencies({ revision: 4, state: "analyzing" });
    dependencies.projects.persistClarificationAnswer.mockResolvedValue({ status: "stale" });

    await expect(answerCreativeVideoClarification(dependencies, input())).rejects.toBeInstanceOf(ProjectRevisionConflictError);
  });

  it("persists the answer atomically before analyzing", async () => {
    const dependencies = makeDependencies();

    await answerCreativeVideoClarification(dependencies, input());

    expect(dependencies.projects.persistClarificationAnswer.mock.invocationCallOrder[0]).toBeLessThan(dependencies.analyze.mock.invocationCallOrder[0]);
    expect(dependencies.analyze).toHaveBeenCalledWith(dependencies, expect.objectContaining({
      projectId: "project-1", userId: "user-1", sourceRevision: 4, requestId: "answer-1",
      previousBrief: expect.objectContaining({ id: "brief-1" }),
    }));
  });

  it("does not analyze when atomic persistence is stale", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.persistClarificationAnswer.mockResolvedValue({ status: "stale" });

    await expect(answerCreativeVideoClarification(dependencies, input())).rejects.toBeInstanceOf(ProjectRevisionConflictError);
    expect(dependencies.analyze).not.toHaveBeenCalled();
  });

  it("retries analysis from the persisted answer without inserting it again", async () => {
    const dependencies = makeDependencies({ state: "analyzing", revision: 4 });
    dependencies.projects.persistClarificationAnswer.mockResolvedValue({ status: "duplicate", project: aggregate({ state: "analyzing", revision: 4 }).project });

    await answerCreativeVideoClarification(dependencies, { ...input(), expectedRevision: 4 });

    expect(dependencies.analyze).toHaveBeenCalledOnce();
    expect(dependencies.projects.persistClarificationAnswer).toHaveBeenCalledOnce();
  });

  it("leaves a persisted answer retryable after AI failure", async () => {
    const dependencies = makeDependencies();
    dependencies.analyze.mockRejectedValue(new AIError({ code: "AI_UNAVAILABLE", safeMessage: "unavailable", requestId: "answer-1", retryable: true }));

    await expect(answerCreativeVideoClarification(dependencies, input())).rejects.toThrow();
    dependencies.projects.getOwnedProject.mockResolvedValue(aggregate({ state: "analyzing", revision: 4 }));
    dependencies.projects.persistClarificationAnswer.mockResolvedValue({ status: "duplicate", project: aggregate({ state: "analyzing", revision: 4 }).project });
    dependencies.analyze.mockResolvedValue({ state: "needs_input", brief: brief(4) });

    await expect(answerCreativeVideoClarification(dependencies, { ...input(), expectedRevision: 4 })).resolves.toMatchObject({ revision: 5 });
  });
});

function input() {
  return { projectId: "project-1", userId: "user-1", expectedRevision: 3, answer: "Diskon 20% untuk semua varian", idempotencyKey: "answer-1" };
}

function makeDependencies(projectOverrides: Record<string, unknown> = {}) {
  return {
    projects: {
      getOwnedProject: vi.fn().mockResolvedValue(aggregate(projectOverrides)),
      persistClarificationAnswer: vi.fn().mockResolvedValue({ status: "created", project: { ...aggregate().project, state: "analyzing", revision: 4 } }),
      applyBriefAnalysis: vi.fn(),
    },
    interpreter: { interpret: vi.fn() },
    concepts: { generate: vi.fn().mockResolvedValue(undefined) },
    analyze: vi.fn().mockResolvedValue({ state: "needs_input", brief: brief(4) }),
    createId: vi.fn().mockReturnValue("message-2"),
    now: vi.fn().mockReturnValue(new Date("2026-09-15T00:01:00.000Z")),
  };
}

function aggregate(projectOverrides: Record<string, unknown> = {}): CreativeProjectAggregate {
  return {
    project: {
      id: "project-1", userId: "user-1", createIdempotencyKey: "create-1", category: { id: "fnb", version: "1" },
      state: "needs_input", revision: 3, assetId: "asset-1", activeConceptId: null, activeCompositionVersionId: null,
      failedStage: null, errorCode: null, previewGenerationCount: 0, previewQuota: 3,
      createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", ...projectOverrides,
    },
    messages: [
      { id: "message-1", projectId: "project-1", role: "user", kind: "brief", text: "Buat promo produk", assetId: "asset-1", projectRevision: 0, idempotencyKey: "create-1", createdAt: "2026-09-15T00:00:00.000Z" },
      { id: "question-1", projectId: "project-1", role: "assistant", kind: "clarification", text: "Berapa diskonnya?", assetId: null, projectRevision: 3, idempotencyKey: "question-1", createdAt: "2026-09-15T00:00:30.000Z" },
    ],
    brief: brief(3), concepts: [],
  };
}

function brief(sourceProjectRevision: number): BriefSnapshot {
  return {
    id: "brief-1", projectId: "project-1", goal: "Promosikan produk", product: "Keripik",
    facts: [{ id: "product_name", value: "Keripik", provenance: "user" }], assumptions: [],
    missingRequiredQuestions: ["Berapa diskonnya?"], optionalQuestions: [], assetIds: ["asset-1"],
    pluginSchemaVersion: "v1", sourceProjectRevision, createdAt: "2026-09-15T00:00:00.000Z",
  };
}
