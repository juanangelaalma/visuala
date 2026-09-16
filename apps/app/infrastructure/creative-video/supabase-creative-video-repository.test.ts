import { describe, expect, it, vi } from "vitest";
import { ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type {
  BriefSnapshot,
  Concept,
  ConversationMessage,
  CreativeProject,
} from "@/domain/creative-video/types";
import { SupabaseCreativeVideoRepository } from "./supabase-creative-video-repository";

const createdAt = "2026-09-14T00:00:00.000Z";
const updatedAt = "2026-09-14T00:01:00.000Z";

const project: CreativeProject = {
  id: "project-1",
  userId: "user-1",
  createIdempotencyKey: "create-key-1",
  category: { id: "product-ad", version: "1.0.0" },
  state: "draft",
  revision: 2,
  assetId: "asset-1",
  activeConceptId: null,
  activeCompositionVersionId: null,
  failedStage: null,
  errorCode: null,
  previewGenerationCount: 0,
  previewQuota: 3,
  createdAt,
  updatedAt,
};

const message: ConversationMessage = {
  id: "message-1",
  projectId: "project-1",
  role: "user",
  kind: "brief",
  text: "Launch this product",
  assetId: "asset-1",
  projectRevision: 2,
  idempotencyKey: "message-key-1",
  createdAt,
};

const brief: BriefSnapshot = {
  id: "brief-1",
  projectId: "project-1",
  goal: "Increase awareness",
  product: "Visuala",
  facts: [{ id: "fact-1", value: "Fast", provenance: "user" }],
  assumptions: ["Vertical placement"],
  missingRequiredQuestions: [],
  optionalQuestions: ["Preferred music?"],
  assetIds: ["asset-1"],
  pluginSchemaVersion: "1.0.0",
  sourceProjectRevision: 2,
  createdAt,
};

const concept: Concept = {
  id: "concept-1",
  projectId: "project-1",
  briefSnapshotId: "brief-1",
  title: "Fast reveal",
  hook: "Create in seconds",
  angle: "Speed",
  sceneOutline: ["Hook", "Problem", "Solution", "CTA"],
  fitReason: "Fits the brief",
  recommendationReason: "Strongest hook",
  recommended: true,
  order: 1,
  generation: {
    requestId: "request-1",
    promptVersion: "concepts-v1",
    model: "model-1",
  },
  createdAt,
};

const projectRow = {
  id: project.id,
  user_id: project.userId,
  create_idempotency_key: project.createIdempotencyKey,
  category_plugin_id: project.category.id,
  category_plugin_version: project.category.version,
  state: project.state,
  revision: project.revision,
  asset_id: project.assetId,
  active_concept_id: null,
  active_composition_version_id: null,
  failed_stage: null,
  error_code: null,
  preview_generation_count: project.previewGenerationCount,
  preview_quota: project.previewQuota,
  created_at: createdAt,
  updated_at: updatedAt,
};

type Result = { data: unknown; error: unknown };

function makeClient(results: readonly Result[]) {
  const queuedResults = [...results];
  const chains: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const from = vi.fn(() => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "order", "insert", "delete"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn().mockImplementation(() =>
      Promise.resolve(queuedResults.shift() ?? { data: null, error: null }),
    );
    chain.single = vi.fn().mockImplementation(() =>
      Promise.resolve(queuedResults.shift() ?? { data: null, error: null }),
    );
    chain.then = vi.fn((resolve) =>
      Promise.resolve(
        queuedResults.shift() ?? { data: null, error: null },
      ).then(resolve),
    );
    chains.push(chain);
    return chain;
  });
  const rpc = vi.fn().mockImplementation(() =>
    Promise.resolve(queuedResults.shift() ?? { data: null, error: null }),
  );

  return { client: { from, rpc }, chains, from, rpc };
}

describe("SupabaseCreativeVideoRepository", () => {
  it("maps an owned aggregate from snake_case rows to camelCase", async () => {
    const { client } = makeClient([
      { data: projectRow, error: null },
      { data: [{ ...message, project_id: message.projectId, asset_id: message.assetId, project_revision: 2, idempotency_key: message.idempotencyKey, created_at: createdAt }], error: null },
      { data: [{ ...brief, project_id: brief.projectId, missing_required_questions: [], optional_questions: brief.optionalQuestions, asset_ids: brief.assetIds, plugin_schema_version: brief.pluginSchemaVersion, source_project_revision: 2, created_at: createdAt }], error: null },
      { data: [{ ...concept, project_id: concept.projectId, brief_snapshot_id: concept.briefSnapshotId, scene_outline: concept.sceneOutline, fit_reason: concept.fitReason, recommendation_reason: concept.recommendationReason, sort_order: concept.order, generation_request_id: concept.generation.requestId, generation_prompt_version: concept.generation.promptVersion, generation_model: concept.generation.model, created_at: createdAt }], error: null },
    ]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    const result = await repository.getOwnedProject("project-1", "user-1");

    expect(result).toEqual({ project, messages: [message], brief, concepts: [concept] });
  });

  it("rejects malformed persisted brief JSON without exposing row contents", async () => {
    const { client } = makeClient([
      { data: projectRow, error: null },
      { data: [], error: null },
      { data: [{ ...brief, project_id: brief.projectId, facts: [{ id: "secret", provenance: "invalid" }], missing_required_questions: [], optional_questions: [], asset_ids: [], plugin_schema_version: brief.pluginSchemaVersion, source_project_revision: 2, created_at: createdAt }], error: null },
      { data: [], error: null },
    ]);

    await expect(new SupabaseCreativeVideoRepository(client as never).getOwnedProject("project-1", "user-1"))
      .rejects.toThrow("Persisted creative video data is invalid.");
  });

  it("rejects malformed persisted concept JSON", async () => {
    const { client } = makeClient([
      { data: projectRow, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ ...concept, project_id: concept.projectId, brief_snapshot_id: concept.briefSnapshotId, scene_outline: ["only one"], fit_reason: concept.fitReason, recommendation_reason: concept.recommendationReason, sort_order: concept.order, generation_request_id: concept.generation.requestId, generation_prompt_version: concept.generation.promptVersion, generation_model: concept.generation.model, created_at: createdAt }], error: null },
    ]);

    await expect(new SupabaseCreativeVideoRepository(client as never).getOwnedProject("project-1", "user-1"))
      .rejects.toThrow("Persisted creative video data is invalid.");
  });

  it("qualifies project reads by both project and owner", async () => {
    const { client, chains } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await repository.getOwnedProject("project-1", "user-1");

    expect(chains[0].eq.mock.calls).toEqual([
      ["id", "project-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("returns null when an owned project is not visible", async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await expect(repository.getOwnedProject("project-1", "user-2")).resolves.toBeNull();
  });

  it("creates a project and initial message through one atomic RPC", async () => {
    const { client, from, rpc } = makeClient([
      { data: { project: projectRow, created: true }, error: null },
      { data: projectRow, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await repository.create({ project, message });

    expect(rpc).toHaveBeenCalledWith("create_owned_creative_project", {
      p_project: expect.objectContaining({ id: "project-1", user_id: "user-1", asset_id: "asset-1" }),
      p_initial_message: expect.objectContaining({ id: "message-1", project_id: "project-1", asset_id: "asset-1" }),
    });
    expect(from.mock.results[0]?.value.insert).not.toHaveBeenCalled();
  });

  it("leaves no direct project insert path when atomic creation fails", async () => {
    const failure = new Error("initial message rejected");
    const { client, from } = makeClient([{ data: null, error: failure }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await expect(repository.create({ project, message })).rejects.toBe(failure);

    expect(from).not.toHaveBeenCalled();
  });

  it("appends a message using its idempotency key", async () => {
    const { client, rpc } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await repository.appendMessage(message);

    expect(rpc).toHaveBeenCalledWith("append_owned_creative_message", {
      p_message: expect.objectContaining({ project_id: "project-1", idempotency_key: "message-key-1", project_revision: 2 }),
    });
  });

  it("persists a clarification answer through one atomic RPC", async () => {
    const answer = { ...message, kind: "answer" as const, projectRevision: 3 };
    const { client, rpc } = makeClient([{ data: { status: "created", project: { ...projectRow, state: "analyzing", revision: 3 } }, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await repository.persistClarificationAnswer({ projectId: "project-1", userId: "user-1", expectedRevision: 2, message: answer });

    expect(rpc).toHaveBeenCalledWith("persist_owned_creative_clarification_answer", {
      p_project_id: "project-1", p_user_id: "user-1", p_expected_revision: 2,
      p_message: expect.objectContaining({ project_id: "project-1", project_revision: 3, kind: "answer" }),
    });
  });

  it("maps a database unique-conflict replay to duplicate success", async () => {
    const answer = { ...message, kind: "answer" as const, projectRevision: 3 };
    const { client } = makeClient([{ data: { status: "duplicate", project: { ...projectRow, state: "analyzing", revision: 3 } }, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await expect(repository.persistClarificationAnswer({ projectId: "project-1", userId: "user-1", expectedRevision: 3, message: answer }))
      .resolves.toMatchObject({ status: "duplicate", project: { revision: 3 } });
  });

  it("atomically persists a brief and claims the expected project revision", async () => {
    const { client, rpc } = makeClient([{ data: { ...projectRow, revision: 3 }, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await repository.applyBriefAnalysis({ snapshot: brief, userId: "user-1", expectedRevision: 2, state: "needs_input" });

    expect(rpc).toHaveBeenCalledWith("apply_owned_creative_brief_analysis", {
      p_project_id: "project-1",
      p_snapshot: expect.objectContaining({ id: "brief-1", project_id: "project-1", facts: brief.facts, source_project_revision: 2 }),
      p_user_id: "user-1", p_expected_revision: 2, p_next_state: "needs_input",
    });
  });

  it("rejects stale brief persistence without exposing stale aggregate data", async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await expect(repository.applyBriefAnalysis({ snapshot: brief, userId: "user-1", expectedRevision: 1, state: "needs_input" }))
      .rejects.toBeInstanceOf(ProjectRevisionConflictError);
  });

  it("atomically stores concepts and transitions the claimed analyzing revision", async () => {
    const { client, rpc } = makeClient([{ data: { ...projectRow, state: "concepts_ready", revision: 3 }, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await repository.applyConceptGeneration({ concepts: [concept], userId: "user-1", expectedRevision: 2, sourceBriefRevision: 1 });

    expect(rpc).toHaveBeenCalledWith("apply_owned_creative_concept_generation", expect.objectContaining({
      p_project_id: "project-1", p_user_id: "user-1", p_expected_revision: 2, p_source_brief_revision: 1,
      p_concept_set: expect.objectContaining({ request_id: "request-1" }),
      p_concepts: [expect.objectContaining({ id: "concept-1" })],
    }));
  });

  it("rejects a stale atomic concept completion", async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);
    await expect(repository.applyConceptGeneration({ concepts: [concept], userId: "user-1", expectedRevision: 1, sourceBriefRevision: 1 }))
      .rejects.toBeInstanceOf(ProjectRevisionConflictError);
  });

  it("uses an owner-scoped atomic compare-and-set transition", async () => {
    const transitionedRow = { ...projectRow, state: "needs_input", revision: 3 };
    const { client, rpc } = makeClient([{ data: transitionedRow, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await expect(repository.transition({
      projectId: "project-1",
      userId: "user-1",
      expectedRevision: 2,
      state: "needs_input",
      patch: { errorCode: null },
    })).resolves.toMatchObject({ state: "needs_input", revision: 3 });
    expect(rpc).toHaveBeenCalledWith("transition_owned_creative_project", {
      p_project_id: "project-1",
      p_user_id: "user-1",
      p_expected_revision: 2,
      p_next_state: "needs_input",
      p_patch: { error_code: null },
    });
  });

  it("rejects a stale expected revision", async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseCreativeVideoRepository(client as never);

    await expect(repository.transition({
      projectId: "project-1",
      userId: "user-1",
      expectedRevision: 1,
      state: "needs_input",
    })).rejects.toBeInstanceOf(ProjectRevisionConflictError);
  });
});
