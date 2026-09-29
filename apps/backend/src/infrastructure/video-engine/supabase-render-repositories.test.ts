import { describe, expect, it, vi } from "vitest";
import { SupabaseRenderJobRepository, SupabaseVideoVersionRepository } from "./supabase-render-repositories";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "66666666-6666-4666-8666-666666666666";
const ARTIFACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
      /** `not(column, "is", null)` normalizes to the `column is not null` filter it produces. */
      not: vi.fn((column: string, _operator: string, value: unknown) => { call.filters.push([column, "is not", value]); return builder; }),
      lt: vi.fn((column: string, value: unknown) => { call.filters.push([column, "<", value]); return builder; }),
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

const jobRow = {
  id: JOB_ID,
  project_id: PROJECT_ID,
  user_id: USER_ID,
  idempotency_key: "render-1-key",
  composition_artifact_id: ARTIFACT_ID,
  kind: "final",
  parent_version_id: null,
  is_revision: false,
  input_snapshot: { compositionHash: "a".repeat(64) },
  status: "queued",
  attempts: 0,
  queued_at: "2026-09-29T00:00:00.000Z",
  started_at: null,
  finished_at: null,
  error_code: null,
  created_at: "2026-09-29T00:00:00.000Z",
  updated_at: "2026-09-29T00:00:00.000Z",
};

const versionRow = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  project_id: PROJECT_ID,
  user_id: USER_ID,
  version_number: 1,
  render_job_id: JOB_ID,
  parent_version_id: null,
  output_object_key: `video-versions/${PROJECT_ID}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp4`,
  kind: "final",
  duration_seconds: 12,
  aspect_ratio: "9:16",
  resolution: "1080p",
  composition_hash: "a".repeat(64),
  created_at: "2026-09-29T00:00:00.000Z",
};

describe("SupabaseRenderJobRepository", () => {
  it("creates a job against a frozen artifact and records the output kind", async () => {
    const { client, calls } = makeClient({ data: jobRow, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    const result = await repository.create({
      id: JOB_ID,
      projectId: PROJECT_ID,
      userId: USER_ID,
      idempotencyKey: "render-1-key",
      compositionArtifactId: ARTIFACT_ID,
      kind: "final",
      parentVersionId: undefined,
      isRevision: false,
      inputSnapshot: { compositionHash: "a".repeat(64) },
    });

    expect(calls[0]).toMatchObject({
      table: "video_render_jobs",
      operation: "insert",
      value: { composition_artifact_id: ARTIFACT_ID, kind: "final", parent_version_id: null },
    });
    expect(result).toMatchObject({ kind: "final", compositionArtifactId: ARTIFACT_ID, status: "queued" });
  });

  it("claims a queued job by incrementing attempts behind a conditional status filter", async () => {
    const { client, calls } = makeClient({ data: jobRow, error: null }, { data: { ...jobRow, status: "preparing", attempts: 1, started_at: "2026-09-29T00:00:01.000Z" }, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    const result = await repository.begin(JOB_ID);

    expect(calls[0]).toMatchObject({ operation: "update", value: { status: "preparing", attempts: 1 } });
    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["id", JOB_ID], ["status", "queued"]]));
    expect(result).toMatchObject({ status: "preparing", attempts: 1 });
  });

  it("does not clear its own started_at when a retry reclaims the job", async () => {
    const started = { ...jobRow, started_at: "2026-09-29T00:00:01.000Z" };
    const { client, calls } = makeClient({ data: started, error: null }, { data: { ...started, status: "preparing", attempts: 2 }, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.begin(JOB_ID);

    expect(calls[0]).toMatchObject({ value: { started_at: "2026-09-29T00:00:01.000Z" } });
  });

  it("refuses to claim a job that is no longer queued", async () => {
    const { client, calls } = makeClient({ data: { ...jobRow, status: "rendering" }, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await expect(repository.begin(JOB_ID)).resolves.toBeNull();
    expect(calls[0]?.operation).toBe("select");
  });

  it("carries the expected prior status into every advance", async () => {
    const { client, calls } = makeClient({ data: { ...jobRow, status: "rendering" }, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.markRendering(JOB_ID);

    expect(calls[0]).toMatchObject({ operation: "update", value: { status: "rendering" } });
    expect(calls[0]?.filters).toContainEqual(["status", "preparing"]);
  });

  it("stamps finished_at only when the job succeeds", async () => {
    const { client, calls } = makeClient({ data: { ...jobRow, status: "succeeded" }, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.succeed(JOB_ID);

    expect(calls[0]?.filters).toContainEqual(["status", "uploading"]);
    expect(calls[0]?.value).toMatchObject({ status: "succeeded", finished_at: expect.any(String) });
  });

  it("fails a job with its error code", async () => {
    const { client, calls } = makeClient({ data: { ...jobRow, status: "failed" }, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.fail(JOB_ID, "render_timeout");

    expect(calls[0]?.value).toMatchObject({ status: "failed", error_code: "render_timeout" });
  });

  it("only cancels a queued job, and only for its owner", async () => {
    const { client, calls } = makeClient({ data: { ...jobRow, status: "cancelled" }, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.cancel(JOB_ID, USER_ID);

    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["id", JOB_ID], ["user_id", USER_ID], ["status", "queued"]]));
  });

  it("takes the oldest queued jobs first", async () => {
    const { client, calls } = makeClient({ data: [jobRow], error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    const result = await repository.listQueued(3);

    expect(calls[0]?.filters).toContainEqual(["status", "queued"]);
    expect(result).toHaveLength(1);
  });

  it("reclaims only jobs that started and then went quiet", async () => {
    const { client, calls } = makeClient({ data: [jobRow], error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.listStale("2026-09-29T00:00:00.000Z", 5);

    expect(calls[0]?.filters).toContainEqual(["started_at", "is not", null]);
    expect(calls[0]?.filters).toContainEqual(["started_at", "<", "2026-09-29T00:00:00.000Z"]);
    expect(calls[0]?.filters).toContainEqual(["status", ["queued", "preparing", "rendering", "uploading"]]);
  });

  it("scopes the latest job read to the owner", async () => {
    const { client, calls } = makeClient({ data: jobRow, error: null });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.latestOwned(PROJECT_ID, USER_ID);

    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["project_id", PROJECT_ID], ["user_id", USER_ID]]));
  });
});

describe("SupabaseVideoVersionRepository", () => {
  it("stores a version with its kind and composition hash", async () => {
    const { client, calls } = makeClient({ data: versionRow, error: null });
    const repository = new SupabaseVideoVersionRepository(client as never);

    const result = await repository.create({
      id: versionRow.id,
      projectId: PROJECT_ID,
      userId: USER_ID,
      versionNumber: 1,
      renderJobId: JOB_ID,
      outputObjectKey: versionRow.output_object_key,
      kind: "final",
      durationSeconds: 12,
      aspectRatio: "9:16",
      resolution: "1080p",
      compositionHash: "a".repeat(64),
    });

    expect(calls[0]).toMatchObject({
      table: "video_versions",
      operation: "insert",
      value: { kind: "final", composition_hash: "a".repeat(64), parent_version_id: null },
    });
    expect(result).toMatchObject({ kind: "final", versionNumber: 1 });
  });

  it("hides previews from the download list in the query itself", async () => {
    const { client, calls } = makeClient({ data: [versionRow], error: null });
    const repository = new SupabaseVideoVersionRepository(client as never);

    await repository.listFinalOwned(PROJECT_ID, USER_ID);

    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["project_id", PROJECT_ID], ["user_id", USER_ID], ["kind", "final"]]));
  });

  it("can read the latest preview, which is what the workspace shows before approval", async () => {
    const { client, calls } = makeClient({ data: { ...versionRow, kind: "preview" }, error: null });
    const repository = new SupabaseVideoVersionRepository(client as never);

    const result = await repository.latestOwned(PROJECT_ID, USER_ID, "preview");

    expect(calls[0]?.filters).toContainEqual(["kind", "preview"]);
    expect(result?.kind).toBe("preview");
  });

  it("numbers the next version from the project's own maximum", async () => {
    const { client, calls } = makeClient({ data: { version_number: 4 }, error: null });
    const repository = new SupabaseVideoVersionRepository(client as never);

    await expect(repository.nextVersionNumber(PROJECT_ID)).resolves.toBe(5);
    expect(calls[0]?.filters).toContainEqual(["project_id", PROJECT_ID]);
  });

  it("starts at one when the project has no versions", async () => {
    const { client } = makeClient({ data: null, error: null });
    const repository = new SupabaseVideoVersionRepository(client as never);

    await expect(repository.nextVersionNumber(PROJECT_ID)).resolves.toBe(1);
  });
});
