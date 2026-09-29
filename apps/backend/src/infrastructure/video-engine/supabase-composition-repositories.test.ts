import { describe, expect, it, vi } from "vitest";
import {
  SupabaseArtDirectionRevisionRepository,
  SupabaseCompositionArtifactRepository,
  SupabaseCompositionEventRepository,
  SupabaseCompositionRevisionRepository,
} from "./supabase-composition-repositories";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "55555555-5555-4555-8555-555555555555";

type Filter = [string, unknown] | [string, string, unknown];
type RecordedCall = { table: string; operation: string; value?: unknown; filters: Filter[] };
type Reply = { data: unknown; error: unknown };

function makeClient(...replies: Reply[]) {
  const calls: RecordedCall[] = [];
  let index = 0;
  const take = (): Reply => (index < replies.length ? replies[index++] : { data: null, error: null });

  const chain = (table: string) => {
    const call: RecordedCall = { table, operation: "select", filters: [] };
    calls.length = 0;
    calls.push(call);

    const builder = {
      select: vi.fn(() => builder),
      insert: vi.fn((value: unknown) => { call.operation = "insert"; call.value = value; return builder; }),
      update: vi.fn((value: unknown) => { call.operation = "update"; call.value = value; return builder; }),
      eq: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
      in: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => take()),
      single: vi.fn(async () => take()),
      then: (resolve: (value: Reply) => unknown) => resolve(take()),
    };
    return builder;
  };

  return { client: { from: vi.fn((table: string) => chain(table)) }, calls };
}

const artDirectionRow = {
  id: "77777777-7777-4777-8777-777777777777",
  project_id: PROJECT_ID,
  user_id: USER_ID,
  version: 2,
  schema_version: "art-direction@v1",
  art_direction: { mainMessage: "Diskon 20%" },
  generated_by: { provider: "9router" },
  source_message_ids: [],
  created_at: "2026-09-29T00:00:00.000Z",
};

const compositionRow = {
  id: "88888888-8888-4888-8888-888888888888",
  project_id: PROJECT_ID,
  user_id: USER_ID,
  version: 1,
  schema_version: "composition-spec@v1",
  brief_revision_id: "99999999-9999-4999-8999-999999999999",
  art_direction_revision_id: artDirectionRow.id,
  design_pack_id: "creative-mode",
  design_pack_version: "1",
  spec: { scenes: [] },
  validation_report: { ok: true, issues: [] },
  candidates: [],
  is_fallback: false,
  generated_by: { provider: "9router" },
  created_at: "2026-09-29T00:00:00.000Z",
};

const artifactRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  project_id: PROJECT_ID,
  user_id: USER_ID,
  composition_revision_id: compositionRow.id,
  design_pack_id: "creative-mode",
  design_pack_version: "1",
  compiler_version: "1.0.0",
  module_versions: { Headline: "1.0.0" },
  asset_hashes: {},
  catalog_components: ["short-offer-badge"],
  composition_hash: "a".repeat(64),
  artifact_prefix: `video-compositions/${PROJECT_ID}/${"a".repeat(64)}`,
  created_at: "2026-09-29T00:00:00.000Z",
};

describe("SupabaseArtDirectionRevisionRepository", () => {
  it("numbers the next revision and appends the direction with its provenance", async () => {
    const { client, calls } = makeClient({ data: { version: 2 }, error: null }, { data: artDirectionRow, error: null });
    const repository = new SupabaseArtDirectionRevisionRepository(client as never);

    const result = await repository.create({
      projectId: PROJECT_ID,
      userId: USER_ID,
      schemaVersion: "art-direction@v1",
      artDirection: { mainMessage: "Diskun 20%" },
      generatedBy: { provider: "9router" },
      sourceMessageIds: [],
    });

    expect(calls[0]).toMatchObject({ table: "video_art_direction_revisions", operation: "insert", value: { version: 3, user_id: USER_ID, project_id: PROJECT_ID } });
    expect(result).toMatchObject({ id: artDirectionRow.id, version: 2, artDirection: artDirectionRow.art_direction });
  });

  it("retries once when two writers picked the same version", async () => {
    const { client, calls } = makeClient(
      { data: { version: 1 }, error: null },
      { data: null, error: { code: "23505" } },
      { data: { version: 2 }, error: null },
      { data: { ...artDirectionRow, version: 3 }, error: null },
    );
    const repository = new SupabaseArtDirectionRevisionRepository(client as never);

    const result = await repository.create({
      projectId: PROJECT_ID, userId: USER_ID, schemaVersion: "art-direction@v1",
      artDirection: {}, generatedBy: {}, sourceMessageIds: [],
    });

    expect(calls[0]).toMatchObject({ operation: "insert", value: { version: 3 } });
    expect(result.version).toBe(3);
  });

  it("scopes the latest read to the owner", async () => {
    const { client, calls } = makeClient({ data: artDirectionRow, error: null });
    const repository = new SupabaseArtDirectionRevisionRepository(client as never);

    await repository.latestOwned(PROJECT_ID, USER_ID);

    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["project_id", PROJECT_ID], ["user_id", USER_ID]]));
  });
});

describe("SupabaseCompositionRevisionRepository", () => {
  it("stores the spec, the report, the shortlist, and the fallback flag", async () => {
    const { client, calls } = makeClient({ data: { version: 0 }, error: null }, { data: compositionRow, error: null });
    const repository = new SupabaseCompositionRevisionRepository(client as never);

    await repository.create({
      projectId: PROJECT_ID,
      userId: USER_ID,
      schemaVersion: "composition-spec@v1",
      briefRevisionId: compositionRow.brief_revision_id,
      artDirectionRevisionId: artDirectionRow.id,
      designPackId: "creative-mode",
      designPackVersion: "1",
      spec: { scenes: [] },
      validationReport: { ok: true, issues: [] },
      candidates: [{ name: "short-offer-badge" }],
      isFallback: false,
      generatedBy: { provider: "9router" },
    });

    expect(calls[0]).toMatchObject({
      operation: "insert",
      value: { version: 1, is_fallback: false, candidates: [{ name: "short-offer-badge" }], design_pack_id: "creative-mode" },
    });
  });

  it("maps a fallback revision to no provenance", async () => {
    const { client } = makeClient({ data: { ...compositionRow, is_fallback: true, generated_by: null }, error: null });
    const repository = new SupabaseCompositionRevisionRepository(client as never);

    const result = await repository.latestOwned(PROJECT_ID, USER_ID);

    expect(result).toMatchObject({ isFallback: true, generatedBy: null });
  });

  it("lists newest first with the owner scope in the query", async () => {
    const { client, calls } = makeClient({ data: [compositionRow], error: null });
    const repository = new SupabaseCompositionRevisionRepository(client as never);

    const result = await repository.listOwned(PROJECT_ID, USER_ID, 5);

    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["project_id", PROJECT_ID], ["user_id", USER_ID]]));
    expect(result).toHaveLength(1);
  });
});

describe("SupabaseCompositionArtifactRepository", () => {
  const input = {
    id: artifactRow.id,
    projectId: PROJECT_ID,
    userId: USER_ID,
    compositionRevisionId: compositionRow.id,
    designPackId: "creative-mode",
    designPackVersion: "1",
    compilerVersion: "1.0.0",
    moduleVersions: { Headline: "1.0.0" },
    assetHashes: {},
    catalogComponents: ["short-offer-badge"],
    compositionHash: artifactRow.composition_hash,
    artifactPrefix: artifactRow.artifact_prefix,
  };

  it("inserts the artifact with its hash and prefix", async () => {
    const { client, calls } = makeClient({ data: artifactRow, error: null });
    const repository = new SupabaseCompositionArtifactRepository(client as never);

    const result = await repository.create(input);

    expect(calls[0]).toMatchObject({
      table: "video_composition_artifacts",
      operation: "insert",
      value: { composition_hash: artifactRow.composition_hash, artifact_prefix: artifactRow.artifact_prefix, catalog_components: ["short-offer-badge"] },
    });
    expect(result.compositionHash).toBe(artifactRow.composition_hash);
  });

  it("returns the stored artifact when the same bytes are compiled again", async () => {
    const { client, calls } = makeClient(
      { data: null, error: { code: "23505" } },
      { data: artifactRow, error: null },
    );
    const repository = new SupabaseCompositionArtifactRepository(client as never);

    const result = await repository.create(input);

    expect(calls[0]?.operation).toBe("select");
    expect(calls[0]?.filters).toContainEqual(["composition_hash", artifactRow.composition_hash]);
    expect(result.id).toBe(artifactRow.id);
  });

  it("fails loudly on an error that is not a hash conflict", async () => {
    const { client } = makeClient({ data: null, error: { code: "23503" } });
    const repository = new SupabaseCompositionArtifactRepository(client as never);

    await expect(repository.create(input)).rejects.toMatchObject({ code: "23503" });
  });
});

describe("SupabaseCompositionEventRepository", () => {
  it("records an event with the nulls the caller left out", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    const repository = new SupabaseCompositionEventRepository(client as never);

    await repository.record({ projectId: PROJECT_ID, userId: USER_ID, event: "composition_planned", isFallback: true, catalogComponents: ["short-offer-badge"] });

    expect(calls[0]).toMatchObject({
      table: "video_composition_events",
      operation: "insert",
      value: { event: "composition_planned", is_fallback: true, catalog_components: ["short-offer-badge"], render_status: null, planner_latency_ms: null },
    });
  });

  it("records the render outcome fields when they are given", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    const repository = new SupabaseCompositionEventRepository(client as never);

    await repository.record({
      projectId: PROJECT_ID, userId: USER_ID, event: "render_succeeded",
      renderJobId: REVISION_ID, renderStatus: "succeeded", renderDurationMs: 1234,
      llmCostAmount: 0.00125, llmCostCurrency: "USD", plannerLatencyMs: 2000,
    });

    expect(calls[0]).toMatchObject({
      value: { render_status: "succeeded", render_duration_ms: 1234, llm_cost_amount: 0.00125, llm_cost_currency: "USD", planner_latency_ms: 2000 },
    });
  });

  it("scopes the event log to the owner", async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    const repository = new SupabaseCompositionEventRepository(client as never);

    await repository.listOwned(PROJECT_ID, USER_ID, 20);

    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["project_id", PROJECT_ID], ["user_id", USER_ID]]));
  });
});
