import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  getCreativeVideoTestDatabaseConfiguration,
  supabaseTestBootstrapSql,
  supabaseTestCleanupSql,
} from "./creative-video-test-database";

const configuration = getCreativeVideoTestDatabaseConfiguration(process.env);
const describeDatabase = configuration ? describe : describe.skip;
const migrationPath = resolve(process.cwd(), "supabase/migrations/20260914000000_create_creative_video_foundation.sql");
const migration = readFileSync(migrationPath, "utf8");
const clarificationMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260915000000_atomic_creative_clarification_answer.sql"), "utf8");

describeDatabase("creative video migration PostgreSQL integration", () => {
  const sql = configuration ? postgres(configuration.databaseUrl, { max: 1 }) : null;
  const ownerId = "00000000-0000-0000-0000-000000000001";
  const otherOwnerId = "00000000-0000-0000-0000-000000000002";
  const assetId = "00000000-0000-0000-0000-000000000011";
  const otherAssetId = "00000000-0000-0000-0000-000000000012";
  const projectId = "00000000-0000-0000-0000-000000000021";
  const otherProjectId = "00000000-0000-0000-0000-000000000022";
  const briefId = "00000000-0000-0000-0000-000000000031";
  const otherBriefId = "00000000-0000-0000-0000-000000000032";

  beforeAll(async () => {
    if (!sql) return;
    await sql.unsafe(supabaseTestCleanupSql);
    await sql.unsafe(supabaseTestBootstrapSql);
    await sql.unsafe(migration);
    await sql.unsafe(clarificationMigration);
    await sql`insert into auth.users (id) values (${ownerId}), (${otherOwnerId})`;
    await sql`insert into public.ai_assets (id, user_id) values (${assetId}, ${ownerId}), (${otherAssetId}, ${otherOwnerId})`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe(supabaseTestCleanupSql);
    await sql.end();
  });

  it("rolls back project creation when the initial message is invalid", async () => {
    if (!sql) return;
    await expect(createProject(projectId, ownerId, assetId, { project_id: otherProjectId })).rejects.toThrow();
    const rows = await sql`select id from public.creative_projects where id = ${projectId}`;
    expect(rows).toHaveLength(0);
  });

  it("rejects a project asset owned by another user", async () => {
    await expect(createProject(projectId, ownerId, otherAssetId)).rejects.toThrow();
  });

  it("atomically replays one project and message for overlapping owner-scoped creates", async () => {
    if (!sql || !configuration) return;
    await setClaims(null, "service_role");
    const secondAssetId = "00000000-0000-0000-0000-000000000013";
    await sql`insert into public.ai_assets (id, user_id) values (${secondAssetId}, ${ownerId})`;
    const first = postgres(configuration.databaseUrl, { max: 1 });
    const second = postgres(configuration.databaseUrl, { max: 1 });

    try {
      const [left, right] = await Promise.all([
        createProjectWithClient(first, projectId, ownerId, assetId, "concurrent-key"),
        createProjectWithClient(second, otherProjectId, ownerId, secondAssetId, "concurrent-key"),
      ]);
      const projects = await sql`select id from public.creative_projects where user_id = ${ownerId} and create_idempotency_key = 'concurrent-key'`;
      const messages = await sql`select id from public.creative_messages where project_id = ${projects[0].id}`;

      expect(left.project.id).toBe(right.project.id);
      expect([left.created, right.created].sort()).toEqual([false, true]);
      expect(projects).toHaveLength(1);
      expect(messages).toHaveLength(1);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
  });

  it("rejects a concept set referencing another project's brief", async () => {
    await seedProjectsAndBriefs();
    await expect(applyConcepts(projectId, ownerId, 0, 0, otherBriefId)).rejects.toThrow();
  });

  it("rejects authenticated owner spoofing", async () => {
    await setClaims(otherOwnerId, "authenticated");
    await expect(createProject(
      "00000000-0000-0000-0000-000000000023",
      ownerId,
      assetId,
      {},
      false,
    )).rejects.toThrow("creative_project_owner_mismatch");
  });

  it("atomically persists a matching brief and advances the project revision", async () => {
    await resetAnalysisFixture();

    const snapshotId = crypto.randomUUID();
    const result = await applyBrief(projectId, ownerId, 0, snapshotId);
    const snapshots = await sql!`select id from public.creative_brief_snapshots where id = ${snapshotId}`;

    expect(result?.revision).toBe(1);
    expect(snapshots).toHaveLength(1);
  });

  it("rolls back snapshot insertion when the expected revision is stale", async () => {
    await resetAnalysisFixture();

    const snapshotId = crypto.randomUUID();
    const result = await applyBrief(projectId, ownerId, 1, snapshotId);
    const snapshots = await sql!`select id from public.creative_brief_snapshots where id = ${snapshotId}`;

    expect(result).toBeNull();
    expect(snapshots).toHaveLength(0);
  });

  it("rejects a snapshot whose project differs from the explicit project", async () => {
    await resetAnalysisFixture();

    await expect(applyBrief(projectId, ownerId, 0, crypto.randomUUID(), { project_id: otherProjectId })).rejects.toThrow("creative_brief_project_mismatch");
  });

  it("rejects a snapshot whose source revision differs from the expected revision", async () => {
    await resetAnalysisFixture();

    await expect(applyBrief(projectId, ownerId, 0, crypto.randomUUID(), { source_project_revision: 1 })).rejects.toThrow("creative_brief_revision_mismatch");
  });

  it("rejects an authenticated user applying another owner's brief", async () => {
    await resetAnalysisFixture();
    await setClaims(otherOwnerId, "authenticated");

    await expect(applyBrief(projectId, ownerId, 0, crypto.randomUUID(), {}, false)).rejects.toThrow("creative_project_owner_mismatch");
  });

  it("rejects service-role child writes when the supplied project does not own the relationship", async () => {
    await setClaims(null, "service_role");
    await seedProjectsAndBriefs();
    await expect(applyConcepts(projectId, ownerId, 0, 0, otherBriefId)).rejects.toThrow();
  });

  it("persists exactly three concepts and transitions to concepts_ready", async () => {
    await resetConceptFixture();
    const result = await applyConcepts(projectId, ownerId, 1, 0, briefId);
    const [project] = await sql!`select state, revision from public.creative_projects where id = ${projectId}`;
    const concepts = await sql!`select id from public.creative_concepts where project_id = ${projectId}`;
    expect({ result, project, conceptCount: concepts.length }).toEqual({ result: { state: "concepts_ready", revision: 2 }, project: expect.objectContaining({ state: "concepts_ready", revision: 2 }), conceptCount: 3 });
  });

  it("leaves no concept writes for a stale revision", async () => {
    await resetConceptFixture();
    const result = await applyConcepts(projectId, ownerId, 0, 0, briefId);
    const sets = await sql!`select id from public.creative_concept_sets where project_id = ${projectId}`;
    const concepts = await sql!`select id from public.creative_concepts where project_id = ${projectId}`;
    expect({ result, sets, concepts }).toEqual({ result: null, sets: [], concepts: [] });
  });

  it("leaves no concept writes for a source revision mismatch", async () => {
    await resetConceptFixture();
    await expect(applyConcepts(projectId, ownerId, 1, 1, briefId)).rejects.toThrow("creative_concept_source_mismatch");
    const sets = await sql!`select id from public.creative_concept_sets where project_id = ${projectId}`;
    const concepts = await sql!`select id from public.creative_concepts where project_id = ${projectId}`;
    expect({ sets, concepts }).toEqual({ sets: [], concepts: [] });
  });

  it("rolls back the state transition when a concept invariant fails", async () => {
    await resetConceptFixture();
    await expect(applyConcepts(projectId, ownerId, 1, 0, briefId, { concepts: makeConceptPayload(projectId, briefId).slice(0, 2) })).rejects.toThrow("creative_concept_count_invalid");
    const [project] = await sql!`select state, revision from public.creative_projects where id = ${projectId}`;
    const sets = await sql!`select id from public.creative_concept_sets where project_id = ${projectId}`;
    expect({ project, sets }).toEqual({ project: expect.objectContaining({ state: "analyzing", revision: 1 }), sets: [] });
  });

  it("allows only one concurrent completion to become active", async () => {
    if (!configuration) return;
    await resetConceptFixture();
    const first = postgres(configuration.databaseUrl, { max: 1 });
    const second = postgres(configuration.databaseUrl, { max: 1 });
    try {
      const [left, right] = await Promise.all([
        applyConceptsWithClient(first, projectId, ownerId, 1, 0, briefId, "00000000-0000-0000-0000-000000000041"),
        applyConceptsWithClient(second, projectId, ownerId, 1, 0, briefId, "00000000-0000-0000-0000-000000000042"),
      ]);
      const sets = await sql!`select id from public.creative_concept_sets where project_id = ${projectId}`;
      const concepts = await sql!`select id from public.creative_concepts where project_id = ${projectId}`;
      expect({ completions: [left, right].filter(Boolean).length, sets: sets.length, concepts: concepts.length }).toEqual({ completions: 1, sets: 1, concepts: 3 });
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
  });

  it("atomically persists a clarification answer and advances needs_input to analyzing", async () => {
    await resetClarificationFixture();
    const result = await persistAnswer(sql!, ownerId, 1, crypto.randomUUID(), "answer-key");
    const messages = await sql!`select kind from public.creative_messages where project_id = ${projectId} and idempotency_key = 'answer-key'`;
    expect({ result, messages }).toEqual({ result: { status: "created", state: "analyzing", revision: 2 }, messages: [{ kind: "answer" }] });
  });

  it("replays concurrent same-key clarification answers deterministically", async () => {
    if (!configuration) return;
    await resetClarificationFixture();
    const first = postgres(configuration.databaseUrl, { max: 1 });
    const second = postgres(configuration.databaseUrl, { max: 1 });
    try {
      const [left, right] = await Promise.all([
        persistAnswer(first, ownerId, 1, crypto.randomUUID(), "same-answer"),
        persistAnswer(second, ownerId, 1, crypto.randomUUID(), "same-answer"),
      ]);
      expect([left.status, right.status].sort()).toEqual(["created", "duplicate"]);
    } finally { await Promise.all([first.end(), second.end()]); }
  });

  it("returns stale without inserting a clarification answer", async () => {
    await resetClarificationFixture();
    const result = await persistAnswer(sql!, ownerId, 0, crypto.randomUUID(), "stale-answer");
    const messages = await sql!`select id from public.creative_messages where project_id = ${projectId} and idempotency_key = 'stale-answer'`;
    expect({ result, messages }).toEqual({ result: { status: "stale" }, messages: [] });
  });

  it("rejects another owner persisting a clarification answer", async () => {
    await resetClarificationFixture();
    await setClaims(otherOwnerId, "authenticated");
    await expect(persistAnswer(sql!, ownerId, 1, crypto.randomUUID(), "unauthorized-answer", false)).rejects.toThrow("creative_project_owner_mismatch");
  });

  it("rolls back the project transition when the answer invariant fails", async () => {
    await resetClarificationFixture();
    await expect(persistAnswer(sql!, ownerId, 1, crypto.randomUUID(), "invalid-answer", true, { kind: "brief" })).rejects.toThrow("creative_clarification_message_invalid");
    const [project] = await sql!`select state, revision from public.creative_projects where id = ${projectId}`;
    expect(project).toMatchObject({ state: "needs_input", revision: 1 });
  });

  it("rejects illegal project transitions without changing the row", async () => {
    await resetAnalysisFixture();
    await setClaims(ownerId, "authenticated");
    await expect(transitionProject("completed", {})).rejects.toThrow("invalid_creative_project_transition");
    const [row] = await sql!`select state, revision from public.creative_projects where id = ${projectId}`;
    expect(row).toMatchObject({ state: "draft", revision: 0 });
  });

  it("allows failed retries only for the recorded stage", async () => {
    await resetAnalysisFixture();
    await setClaims(null, "service_role");
    await sql!`update public.creative_projects set state = 'failed', failed_stage = 'analysis' where id = ${projectId}`;
    await setClaims(ownerId, "authenticated");
    await expect(transitionProject("building_preview", {})).rejects.toThrow("invalid_creative_project_transition");
    await expect(transitionProject("analyzing", { failed_stage: null, error_code: null })).resolves.toMatchObject({ state: "analyzing", revision: 1 });
  });

  async function setClaims(userId: string | null, role: string) {
    if (!sql) return;
    await sql`select set_config('request.jwt.claim.sub', ${userId ?? ""}, false), set_config('request.jwt.claim.role', ${role}, false)`;
  }

  async function transitionProject(nextState: string, patch: Record<string, string | null>) {
    const rows = await sql!`select (result).state as state, (result).revision as revision from (select public.transition_owned_creative_project(${projectId}, ${ownerId}, 0, ${nextState}, ${sql!.json(patch)}) as result) transition`;
    return rows[0];
  }

  async function createProject(id: string, userId: string, ownedAssetId: string, messagePatch = {}, setAuthenticatedClaims = true) {
    if (!sql) return;
    if (setAuthenticatedClaims) await setClaims(userId, "authenticated");
    const project = { id, user_id: userId, create_idempotency_key: crypto.randomUUID(), category_plugin_id: "product-ad", category_plugin_version: "1", state: "draft", revision: 0, asset_id: ownedAssetId, active_concept_id: null, active_composition_version_id: null, failed_stage: null, error_code: null, preview_generation_count: 0, preview_quota: 3, created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z" };
    const message = { id: crypto.randomUUID(), project_id: id, role: "user", kind: "brief", text: "Brief", asset_id: ownedAssetId, project_revision: 0, idempotency_key: crypto.randomUUID(), created_at: "2026-09-14T00:00:00Z", ...messagePatch };
    await sql`select public.create_owned_creative_project(${sql.json(project)}, ${sql.json(message)})`;
  }

  async function createProjectWithClient(client: postgres.Sql, id: string, userId: string, ownedAssetId: string, createKey: string) {
    const project = { id, user_id: userId, create_idempotency_key: createKey, category_plugin_id: "product-ad", category_plugin_version: "1", state: "draft", revision: 0, asset_id: ownedAssetId, active_concept_id: null, active_composition_version_id: null, failed_stage: null, error_code: null, preview_generation_count: 0, preview_quota: 3, created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z" };
    const message = { id: crypto.randomUUID(), project_id: id, role: "user", kind: "brief", text: "Brief", asset_id: ownedAssetId, project_revision: 0, idempotency_key: createKey, created_at: "2026-09-14T00:00:00Z" };
    const [result] = await client`select public.create_owned_creative_project(${client.json(project)}, ${client.json(message)}) as result`;
    return result.result as { project: { id: string }; created: boolean };
  }

  async function seedProjectsAndBriefs() {
    if (!sql) return;
    await setClaims(null, "service_role");
    for (const [id, userId, ownedAssetId, snapshotId] of [[projectId, ownerId, assetId, briefId], [otherProjectId, otherOwnerId, otherAssetId, otherBriefId]]) {
      await sql`insert into public.creative_projects (id, user_id, create_idempotency_key, category_plugin_id, category_plugin_version, state, revision, asset_id) values (${id}, ${userId}, ${crypto.randomUUID()}, 'product-ad', '1', 'draft', 0, ${ownedAssetId}) on conflict do nothing`;
      await sql`insert into public.creative_brief_snapshots (id, project_id, goal, product, facts, assumptions, missing_required_questions, optional_questions, asset_ids, plugin_schema_version, source_project_revision) values (${snapshotId}, ${id}, 'Goal', 'Product', '[]', '[]', '[]', '[]', '[]', '1', 0) on conflict do nothing`;
    }
  }

  async function applyConcepts(id: string, userId: string, expectedRevision: number, sourceRevision: number, snapshotId: string, patch: { concepts?: ReturnType<typeof makeConceptPayload> } = {}) {
    if (!sql) return null;
    return applyConceptsWithClient(sql, id, userId, expectedRevision, sourceRevision, snapshotId, "00000000-0000-0000-0000-000000000041", patch);
  }

  async function applyConceptsWithClient(client: postgres.Sql, id: string, userId: string, expectedRevision: number, sourceRevision: number, snapshotId: string, setId: string, patch: { concepts?: ReturnType<typeof makeConceptPayload> } = {}) {
    const set = { id: setId, project_id: id, brief_snapshot_id: snapshotId, request_id: setId, prompt_version: "v1", model: "model", created_at: "2026-09-14T00:00:00Z" };
    const concepts = patch.concepts ?? makeConceptPayload(id, snapshotId, setId);
    const rows = await client`select (result).state as state, (result).revision as revision from (select public.apply_owned_creative_concept_generation(${id}, ${userId}, ${expectedRevision}, ${sourceRevision}, ${client.json(set)}, ${client.json(concepts)}) as result) completion`;
    return rows[0]?.state === null ? null : { state: rows[0].state as string, revision: rows[0].revision as number };
  }

  function makeConceptPayload(id: string, snapshotId: string, setId = "00000000-0000-0000-0000-000000000041") {
    return [1, 2, 3].map((order) => ({ id: `00000000-0000-0000-0000-00000000005${order}`, project_id: id, concept_set_id: setId, brief_snapshot_id: snapshotId, title: `Concept ${order}`, hook: `Hook ${order}`, angle: `Angle ${order}`, scene_outline: [`${order}.1`, `${order}.2`, `${order}.3`, `${order}.4`], fit_reason: `Fit ${order}`, recommendation_reason: `Reason ${order}`, recommended: order === 1, sort_order: order, generation_request_id: setId, generation_prompt_version: "v1", generation_model: "model", created_at: "2026-09-14T00:00:00Z" }));
  }

  async function applyBrief(id: string, userId: string, revision: number, snapshotId: string, patch = {}, setAuthenticatedClaims = true) {
    if (!sql) return null;
    if (setAuthenticatedClaims) await setClaims(userId, "authenticated");
    const snapshot = { id: snapshotId, project_id: id, goal: "Goal", product: "unknown", facts: [], assumptions: [], missing_required_questions: [], optional_questions: [], asset_ids: [assetId], plugin_schema_version: "v1", source_project_revision: revision, created_at: "2026-09-14T00:00:00Z", ...patch };
    const rows = await sql`select (public.apply_owned_creative_brief_analysis(${id}, ${sql.json(snapshot)}, ${userId}, ${revision}, 'analyzing')).revision as revision`;
    return rows[0]?.revision === null ? null : { revision: rows[0].revision as number };
  }

  async function resetAnalysisFixture() {
    if (!sql) return;
    await setClaims(null, "service_role");
    await sql`update public.creative_projects set revision = 0, state = 'draft' where id = ${projectId}`;
    const existing = await sql`select id from public.creative_projects where id = ${projectId}`;
    if (existing.length === 0) await createProject(projectId, ownerId, assetId);
  }

  async function resetConceptFixture() {
    if (!sql) return;
    await setClaims(null, "service_role");
    await sql`truncate public.creative_concepts, public.creative_concept_sets, public.creative_brief_snapshots, public.creative_messages, public.creative_projects cascade`;
    await createProject(projectId, ownerId, assetId);
    await applyBrief(projectId, ownerId, 0, briefId);
  }

  async function resetClarificationFixture() {
    await resetConceptFixture();
    await sql!`update public.creative_projects set state = 'needs_input' where id = ${projectId}`;
  }

  async function persistAnswer(client: postgres.Sql, userId: string, revision: number, messageId: string, key: string, setAuthenticatedClaims = true, patch = {}) {
    if (setAuthenticatedClaims) await setClaims(userId, "authenticated");
    const message = { id: messageId, project_id: projectId, role: "user", kind: "answer", text: "Diskon 20%", asset_id: null, project_revision: revision + 1, idempotency_key: key, created_at: "2026-09-15T00:00:00Z", ...patch };
    const [row] = await client`select public.persist_owned_creative_clarification_answer(${projectId}, ${userId}, ${revision}, ${client.json(message)}) as result`;
    const result = row.result as { status: string; project?: { state: string; revision: number } };
    return result.project ? { status: result.status, state: result.project.state, revision: result.project.revision } : { status: result.status };
  }
});
