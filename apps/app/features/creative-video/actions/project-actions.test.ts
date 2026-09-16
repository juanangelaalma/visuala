import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ services: vi.fn(), create: vi.fn(), answer: vi.fn(), error: vi.fn() }));
vi.mock("@/application/creative-video/services", () => ({ createCreativeVideoServices: mocks.services }));
vi.mock("@/application/creative-video/answer-clarification", () => ({ answerCreativeVideoClarification: mocks.answer }));
vi.mock("@/application/creative-video/create-project", () => ({
  createCreativeProject: mocks.create,
  AssetCleanupError: class AssetCleanupError extends Error {
    constructor(public readonly context: { cleanupOperationId: string; requestId: string; projectId: string }) { super(); this.name = "AssetCleanupError"; }
  },
}));

import { answerCreativeVideoAction, createCreativeProjectAction } from "./project-actions";

const idempotencyKey = "123e4567-e89b-42d3-a456-426614174000";
const projectId = "223e4567-e89b-42d3-a456-426614174000";

describe("createCreativeProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(mocks.error);
  });

  it("rejects invalid input before creating services", async () => {
    expect(await createCreativeProjectAction({}, new FormData())).toEqual({ error: "Describe the video you want to create." });
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it("requires an authenticated user", async () => {
    mocks.services.mockResolvedValue(services(null));

    expect(await createCreativeProjectAction({}, validForm())).toEqual({ error: "Sign in to continue." });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns only a safe project projection", async () => {
    const dependencies = services({ id: "user-1" });
    mocks.services.mockResolvedValue(dependencies);
    mocks.create.mockResolvedValue({ project: { id: "project-1", revision: 0, state: "analyzing" }, messages: [{ text: "secret prompt" }] });

    const result = await createCreativeProjectAction({}, validForm());

    expect(mocks.create).toHaveBeenCalledWith(dependencies.creation, expect.objectContaining({ userId: "user-1", prompt: "Buat konten jualan", idempotencyKey, category: { id: "fnb", version: "1" } }));
    expect(result).toEqual({ projectId: "project-1", revision: 0, state: "analyzing", message: "Project created." });
    expect(JSON.stringify(result)).not.toContain("secret prompt");
  });

  it("logs sanitized diagnostics and returns a safe error", async () => {
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.create.mockRejectedValue(new Error("signed-url?prompt=secret"));

    const result = await createCreativeProjectAction({}, validForm());

    expect(result).toEqual({ error: "Could not create the project." });
    expect(mocks.error).toHaveBeenCalledWith("Failed to create creative video project", { name: "Error" });
  });

  it("returns and logs safe cleanup correlation context", async () => {
    const { AssetCleanupError } = await import("@/application/creative-video/create-project");
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.create.mockRejectedValue(new AssetCleanupError({ cleanupOperationId: "cleanup-1", requestId: idempotencyKey, projectId: "project-1" }));

    const result = await createCreativeProjectAction({}, validForm());

    expect(result).toEqual({ error: "Project creation needs cleanup. Contact support with reference cleanup-1.", cleanupOperationId: "cleanup-1" });
    expect(mocks.error).toHaveBeenCalledWith("Failed to create creative video project", { name: "AssetCleanupError", projectId: "project-1", requestId: idempotencyKey, cleanupOperationId: "cleanup-1" });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("Buat konten jualan");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("signed-url");
  });
});

describe("answerCreativeVideoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(mocks.error);
  });

  it("authenticates before validating revision input", async () => {
    mocks.services.mockResolvedValue(services(null));
    expect(await answerCreativeVideoAction({}, new FormData())).toEqual({ error: "Sign in to continue." });
  });

  it("requires an authenticated user", async () => {
    mocks.services.mockResolvedValue(services(null));

    expect(await answerCreativeVideoAction({}, answerForm())).toEqual({ error: "Sign in to continue." });
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("returns a safe project projection", async () => {
    const dependencies = services({ id: "user-1" });
    mocks.services.mockResolvedValue(dependencies);
    mocks.answer.mockResolvedValue({ state: "needs_input", revision: 5, brief: { id: "brief-2", facts: [{ value: "secret" }] } });

    const result = await answerCreativeVideoAction({}, answerForm());

    expect(mocks.answer).toHaveBeenCalledWith(dependencies.clarification, {
      projectId, userId: "user-1", expectedRevision: 3,
      answer: "Diskon 20% untuk semua varian", idempotencyKey,
    });
    expect(result).toEqual({ projectId, revision: 5, state: "needs_input", message: "Answer saved." });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("returns a safe refresh-required state for revision conflicts", async () => {
    const { ProjectRevisionConflictError } = await import("@/domain/creative-video/errors");
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.answer.mockRejectedValue(new ProjectRevisionConflictError());

    expect(await answerCreativeVideoAction({}, answerForm())).toEqual({ error: "This creative project changed. Refresh and try again.", refreshRequired: true });
    expect(mocks.error).not.toHaveBeenCalled();
  });
});

function services(user: unknown) {
  return { authProvider: { getCurrentUser: vi.fn().mockResolvedValue(user) }, creation: {}, clarification: {} };
}

function validForm() {
  const form = new FormData();
  form.set("prompt", "Buat konten jualan");
  form.set("image", new File([new Uint8Array([1])], "product.png", { type: "image/png" }));
  form.set("idempotencyKey", idempotencyKey);
  form.set("categoryId", "fnb");
  form.set("categoryVersion", "1");
  return form;
}

function answerForm() {
  const form = new FormData();
  form.set("projectId", projectId);
  form.set("expectedRevision", "3");
  form.set("answer", "Diskon 20% untuk semua varian");
  form.set("idempotencyKey", idempotencyKey);
  return form;
}
