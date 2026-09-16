import { describe, expect, it, vi } from "vitest";
import type { AIAsset } from "@/domain/ai-service/assets";
import type { CreativeProjectAggregate } from "@/domain/creative-video/types";
import { createCreativeProject } from "./create-project";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const assetId = "44444444-4444-4444-8444-444444444444";
const loserAssetId = "55555555-5555-4555-8555-555555555555";
const cleanupOperationId = "cleanup-66666666-6666-4666-8666-666666666666";
const createdAt = "2026-09-15T00:00:00.000Z";
const image = new File([new Uint8Array([1, 2, 3])], "product.png", { type: "image/png" });

describe("createCreativeProject", () => {
  it("registers the image and atomically persists an analyzing project with its first message", async () => {
    const dependencies = makeDependencies();

    const result = await createCreativeProject(dependencies, input());

    expect(dependencies.assets.register).toHaveBeenCalledWith({ userId, bytes: new Uint8Array([1, 2, 3]), declaredMimeType: "image/png" });
    expect(dependencies.projects.create).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: projectId, userId, category: { id: "fnb", version: "1" }, state: "analyzing", revision: 0, assetId }),
      message: expect.objectContaining({ id: messageId, projectId, role: "user", kind: "brief", text: "Buat konten jualan", assetId, projectRevision: 0, idempotencyKey: "submit-1" }),
    });
    expect(dependencies.assets.register.mock.invocationCallOrder[0]).toBeLessThan(dependencies.projects.create.mock.invocationCallOrder[0]);
    expect(result.project.state).toBe("analyzing");
  });

  it("returns an existing aggregate without registering another asset", async () => {
    const existing = aggregate();
    const dependencies = makeDependencies(existing);

    await expect(createCreativeProject(dependencies, input())).resolves.toBe(existing);
    expect(dependencies.assets.register).not.toHaveBeenCalled();
    expect(dependencies.analyze).not.toHaveBeenCalled();
  });

  it("starts analysis once after durable project persistence", async () => {
    const dependencies = makeDependencies();

    await createCreativeProject(dependencies, input());

    expect(dependencies.analyze).toHaveBeenCalledOnce();
    expect(dependencies.analyze).toHaveBeenCalledWith({ userId, projectId, sourceRevision: 0, requestId: "creative-project-analysis:submit-1" });
    expect(dependencies.projects.create.mock.invocationCallOrder[0]).toBeLessThan(dependencies.analyze.mock.invocationCallOrder[0]);
  });

  it("keeps the durable project recoverable when initial analysis fails", async () => {
    const dependencies = makeDependencies();
    dependencies.analyze.mockRejectedValue(new Error("provider unavailable"));

    await expect(createCreativeProject(dependencies, input())).rejects.toThrow("provider unavailable");

    expect(dependencies.assets.remove).not.toHaveBeenCalled();
  });

  it("attempts orphan cleanup when project persistence fails", async () => {
    const dependencies = makeDependencies();
    const failure = new Error("database unavailable");
    dependencies.projects.create.mockRejectedValue(failure);

    await expect(createCreativeProject(dependencies, input())).rejects.toBe(failure);
    expect(dependencies.assets.remove).toHaveBeenCalledWith(assetId, userId);
  });

  it("removes only the losing asset when overlapping creates replay the winner", async () => {
    const firstDependencies = makeDependencies();
    const secondDependencies = makeDependencies();
    const winner = aggregate();
    secondDependencies.assets.register.mockResolvedValue(asset(loserAssetId));
    let releaseFirst!: () => void;
    const overlap = new Promise<void>((resolve) => { releaseFirst = resolve; });
    firstDependencies.projects.create.mockImplementation(async () => { await overlap; return { aggregate: winner, created: true }; });
    secondDependencies.projects.create.mockImplementation(async () => { releaseFirst(); return { aggregate: winner, created: false }; });

    const [first, second] = await Promise.all([
      createCreativeProject(firstDependencies, input()),
      createCreativeProject(secondDependencies, input()),
    ]);

    expect(first).toBe(winner);
    expect(second).toBe(winner);
    expect(first.project.assetId).toBe(assetId);
    expect(second.project.assetId).toBe(assetId);
    expect(firstDependencies.assets.remove).not.toHaveBeenCalled();
    expect(firstDependencies.assets.remove).not.toHaveBeenCalledWith(loserAssetId, userId);
    expect(secondDependencies.assets.remove).toHaveBeenCalledWith(loserAssetId, userId);
    expect(secondDependencies.assets.remove).not.toHaveBeenCalledWith(assetId, userId);
  });

  it("does not remove the winning asset", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.create.mockResolvedValue({ aggregate: aggregate(), created: true });

    await createCreativeProject(dependencies, input());

    expect(dependencies.assets.remove).not.toHaveBeenCalled();
  });

  it("reports sanitized cleanup failure when a race loser cannot remove its orphan", async () => {
    const dependencies = makeDependencies();
    dependencies.projects.create.mockResolvedValue({ aggregate: aggregate(), created: false });
    dependencies.assets.remove.mockRejectedValue(new Error("secret object key"));

    await expect(createCreativeProject(dependencies, input())).rejects.toMatchObject({ context: {
      cleanupOperationId,
      requestId: "submit-1",
      projectId,
    } });
    expect(dependencies.createCleanupOperationId).toHaveBeenCalledOnce();
  });

  it("resolves the requested Category before registering the asset", async () => {
    const dependencies = makeDependencies();
    dependencies.plugins.resolveCategory.mockImplementation(() => { throw new Error("missing Category"); });

    await expect(createCreativeProject(dependencies, input())).rejects.toThrow("missing Category");
    expect(dependencies.assets.register).not.toHaveBeenCalled();
  });
});

function input() {
  return { userId, prompt: "Buat konten jualan", image, idempotencyKey: "submit-1", category: { id: "fnb", version: "1" } };
}

function makeDependencies(existing: CreativeProjectAggregate | null = null) {
  const value = aggregate();
  return {
    projects: { findByCreateKey: vi.fn().mockResolvedValue(existing), create: vi.fn().mockResolvedValue({ aggregate: value, created: true }) },
    assets: { register: vi.fn().mockResolvedValue(asset()), remove: vi.fn().mockResolvedValue(undefined) },
    plugins: { resolveCategory: vi.fn().mockReturnValue({ ref: { id: "fnb", version: "1" } }) },
    analyze: vi.fn().mockResolvedValue(undefined),
    createId: vi.fn().mockReturnValueOnce(projectId).mockReturnValueOnce(messageId),
    createCleanupOperationId: vi.fn().mockReturnValue(cleanupOperationId),
    now: vi.fn().mockReturnValue(new Date(createdAt)),
  };
}

function asset(id = assetId): AIAsset {
  return { id, userId, objectKey: "private/product.png", mimeType: "image/png", byteSize: 3, sha256: "hash", width: 1, height: 1, validated: true, createdAt };
}

function aggregate(): CreativeProjectAggregate {
  return {
    project: { id: projectId, userId, createIdempotencyKey: "submit-1", category: { id: "fnb", version: "1" }, state: "analyzing", revision: 0, assetId, activeConceptId: null, activeCompositionVersionId: null, failedStage: null, errorCode: null, previewGenerationCount: 0, previewQuota: 3, createdAt, updatedAt: createdAt },
    messages: [{ id: messageId, projectId, role: "user", kind: "brief", text: "Buat konten jualan", assetId, projectRevision: 0, idempotencyKey: "submit-1", createdAt }],
    brief: null,
    concepts: [],
  };
}
