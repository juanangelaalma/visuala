import { describe, expect, it, vi } from "vitest";
import type { VideoProject } from "../../domain/video/types";
import { createVideoProject } from "./create-video-project";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";
const settings = { durationSeconds: 6 as const, aspectRatio: "9:16" as const, resolution: "720p" as const, language: "id", voiceOverEnabled: true, musicEnabled: true };

function project(overrides: Partial<VideoProject> = {}): VideoProject {
  return { id: PROJECT_ID, userId: USER_ID, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", status: "draft", settings, revisionRenderCount: 0, createdAt: "created", updatedAt: "updated", ...overrides };
}

function dependencies(existing: VideoProject | null = null) {
  return {
    createId: vi.fn(() => PROJECT_ID),
    projects: {
      findByIdempotencyKey: vi.fn(async () => existing),
      create: vi.fn(async ({ idempotencyKey: _idempotencyKey, ...input }) => project(input)),
    },
  };
}

function command(overrides = {}) {
  return { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, title: " Promo Kopi ", videoType: "product_promo" as const, styleId: "bold_pop" as const, settings, ...overrides };
}

describe("createVideoProject", () => {
  it("creates the first project with the owner-scoped idempotency key", async () => {
    const deps = dependencies();

    const result = await createVideoProject(command(), deps);

    expect(result).toEqual({ project: project({ title: "Promo Kopi" }), created: true });
    expect(deps.projects.create).toHaveBeenCalledWith({ id: PROJECT_ID, userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY, title: "Promo Kopi", videoType: "product_promo", styleId: "bold_pop", settings });
  });

  it("returns an existing project for a repeated key without creating", async () => {
    const existing = project({ id: "55555555-5555-4555-8555-555555555555" });
    const deps = dependencies(existing);

    await expect(createVideoProject(command(), deps)).resolves.toEqual({ project: existing, created: false });
    expect(deps.projects.create).not.toHaveBeenCalled();
  });

  it("allows the same key to create a separate project for another user", async () => {
    const deps = dependencies();

    await createVideoProject(command({ userId: OTHER_USER_ID }), deps);

    expect(deps.projects.findByIdempotencyKey).toHaveBeenCalledWith(OTHER_USER_ID, IDEMPOTENCY_KEY);
    expect(deps.projects.create).toHaveBeenCalledWith(expect.objectContaining({ userId: OTHER_USER_ID, idempotencyKey: IDEMPOTENCY_KEY }));
  });

  it.each(["", "   ", "not-a-uuid"])("rejects idempotency key %j before persistence", async (idempotencyKey) => {
    const deps = dependencies();

    await expect(createVideoProject(command({ idempotencyKey }), deps)).rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.projects.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(deps.projects.create).not.toHaveBeenCalled();
  });

  it("validates project input before persistence", async () => {
    const deps = dependencies();

    await expect(createVideoProject(command({ title: "   " }), deps)).rejects.toMatchObject({ code: "video_input_invalid" });
    expect(deps.projects.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(deps.projects.create).not.toHaveBeenCalled();
  });

  it("returns the winning project only for the intended idempotency constraint race", async () => {
    const winner = project({ id: "55555555-5555-4555-8555-555555555555" });
    const deps = dependencies();
    deps.projects.create.mockRejectedValue({ code: "23505", constraint: "video_projects_user_id_idempotency_key_key" });
    deps.projects.findByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);

    await expect(createVideoProject(command(), deps)).resolves.toEqual({ project: winner, created: false });
  });

  it("does not swallow an unrelated unique violation", async () => {
    const failure = { code: "23505", constraint: "video_projects_pkey" };
    const deps = dependencies();
    deps.projects.create.mockRejectedValue(failure);

    await expect(createVideoProject(command(), deps)).rejects.toBe(failure);
    expect(deps.projects.findByIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it("rethrows the intended race when the winning project cannot be read", async () => {
    const failure = { code: "23505", constraint: "video_projects_user_id_idempotency_key_key" };
    const deps = dependencies();
    deps.projects.create.mockRejectedValue(failure);

    await expect(createVideoProject(command(), deps)).rejects.toBe(failure);
  });
});
