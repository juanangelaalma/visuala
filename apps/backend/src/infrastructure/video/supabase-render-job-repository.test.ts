import { describe, expect, it, vi } from "vitest";
import { SupabaseRenderJobRepository } from "./supabase-render-job-repository";

const ROW = {
  id: "66666666-6666-4666-8666-666666666666",
  project_id: "33333333-3333-4333-8333-333333333333",
  user_id: "11111111-1111-4111-8111-111111111111",
  idempotency_key: "render-0001",
  brief_revision_id: "44444444-4444-4444-8444-444444444444",
  storyboard_revision_id: "55555555-5555-4555-8555-555555555555",
  parent_version_id: null,
  is_revision: false,
  input_snapshot: { schemaVersion: "render-input@v1" },
  status: "queued",
  attempts: 0,
  queued_at: "2026-09-21T00:00:00.000Z",
  started_at: null,
  finished_at: null,
  error_code: null,
  created_at: "2026-09-21T00:00:00.000Z",
  updated_at: "2026-09-21T00:00:00.000Z",
};

const ACTIVE_STATUSES = ["queued", "preparing", "rendering", "uploading"];

type Filter = [string, unknown] | [string, "in", unknown[]];
type RecordedCall = { table: string; operation: string; value?: unknown; filters: Filter[]; order?: [string, boolean | undefined]; limit?: number };

/** Records the most recently started query in `calls[0]`; `begin` reads the row and then writes it. */
function makeClient(result: unknown = ROW) {
  const calls: RecordedCall[] = [];
  const client = {
    calls,
    from: vi.fn((table: string) => chain(table, result, calls)),
  };
  return { client, calls };
}

function chain(table: string, result: unknown, calls: RecordedCall[]) {
  const call: RecordedCall = { table, operation: "select", filters: [] };
  calls.length = 0;
  calls.push(call);

  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn((value: unknown) => { call.operation = "insert"; call.value = value; return builder; }),
    update: vi.fn((value: unknown) => { call.operation = "update"; call.value = value; return builder; }),
    eq: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
    in: vi.fn((column: string, values: unknown[]) => { call.filters.push([column, "in", values]); return builder; }),
    is: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => { call.order = [column, options?.ascending]; return builder; }),
    limit: vi.fn((count: number) => { call.limit = count; return builder; }),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    single: vi.fn(async () => ({ data: result, error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: result, error: null }),
  };

  return builder;
}

describe("SupabaseRenderJobRepository", () => {
  it("inserts the job columns and maps the row back", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseRenderJobRepository(client as never);

    const created = await repository.create({
      id: ROW.id,
      projectId: ROW.project_id,
      userId: ROW.user_id,
      idempotencyKey: ROW.idempotency_key,
      briefRevisionId: ROW.brief_revision_id,
      storyboardRevisionId: ROW.storyboard_revision_id,
      isRevision: false,
      inputSnapshot: ROW.input_snapshot,
    });

    expect(calls[0]).toMatchObject({ table: "video_render_jobs", operation: "insert", value: { id: ROW.id, project_id: ROW.project_id, user_id: ROW.user_id, idempotency_key: ROW.idempotency_key, parent_version_id: null, is_revision: false } });
    expect(created).toMatchObject({ id: ROW.id, projectId: ROW.project_id, status: "queued", attempts: 0, isRevision: false });
    expect(created.parentVersionId).toBeUndefined();
    expect(created.startedAt).toBeUndefined();
  });

  it("stores the parent version of a revision job", async () => {
    const parentVersionId = "88888888-8888-4888-8888-888888888888";
    const { client, calls } = makeClient({ ...ROW, parent_version_id: parentVersionId, is_revision: true });
    const repository = new SupabaseRenderJobRepository(client as never);

    const created = await repository.create({
      id: ROW.id,
      projectId: ROW.project_id,
      userId: ROW.user_id,
      idempotencyKey: ROW.idempotency_key,
      briefRevisionId: ROW.brief_revision_id,
      storyboardRevisionId: ROW.storyboard_revision_id,
      parentVersionId,
      isRevision: true,
      inputSnapshot: ROW.input_snapshot,
    });

    expect(calls[0]?.value).toMatchObject({ parent_version_id: parentVersionId, is_revision: true });
    expect(created).toMatchObject({ parentVersionId, isRevision: true });
  });

  it("qualifies an owned read by owner and returns null when the row is missing", async () => {
    const { client, calls } = makeClient(null);
    const repository = new SupabaseRenderJobRepository(client as never);

    await expect(repository.getOwned(ROW.id, ROW.user_id)).resolves.toBeNull();

    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
  });

  it("reads a job by id without an owner filter for the worker", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.getById(ROW.id);

    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).not.toContainEqual(["user_id", ROW.user_id]);
  });

  it("scopes the idempotency lookup to the project and its owner", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.findByIdempotencyKey(ROW.project_id, ROW.user_id, ROW.idempotency_key);

    expect(calls[0]?.filters).toContainEqual(["project_id", ROW.project_id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["idempotency_key", ROW.idempotency_key]);
  });

  it("looks for an active job of the project with the same statuses the partial index guards", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.findActiveForProject(ROW.project_id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["project_id", ROW.project_id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["status", "in", ACTIVE_STATUSES]);
    expect(calls[0]?.order).toEqual(["created_at", false]);
    expect(calls[0]?.limit).toBe(1);
  });

  it("only claims a queued job and counts the attempt", async () => {
    const { client, calls } = makeClient({ ...ROW, attempts: 2 });
    const repository = new SupabaseRenderJobRepository(client as never);

    await repository.begin(ROW.id);

    expect(calls[0]).toMatchObject({ operation: "update", value: { status: "preparing", attempts: 3 } });
    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["status", "queued"]);
    expect(typeof (calls[0]?.value as { started_at?: unknown }).started_at).toBe("string");
  });

  it("refuses to claim a job that is no longer queued", async () => {
    const { client, calls } = makeClient({ ...ROW, status: "rendering" });
    const repository = new SupabaseRenderJobRepository(client as never);

    await expect(repository.begin(ROW.id)).resolves.toBeNull();
    expect(calls[0]?.operation).toBe("select");
  });

  it("records a terminal failure with its error code", async () => {
    const { client, calls } = makeClient({ ...ROW, status: "failed", error_code: "video_revision_quota_exhausted" });
    const repository = new SupabaseRenderJobRepository(client as never);

    const failed = await repository.fail(ROW.id, "video_revision_quota_exhausted");

    expect(calls[0]).toMatchObject({ operation: "update", value: { status: "failed", error_code: "video_revision_quota_exhausted" } });
    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(failed?.errorCode).toBe("video_revision_quota_exhausted");
  });

  it("cancels only a queued job of the caller", async () => {
    const { client, calls } = makeClient({ ...ROW, status: "cancelled" });
    const repository = new SupabaseRenderJobRepository(client as never);

    const cancelled = await repository.cancel(ROW.id, ROW.user_id);

    expect(calls[0]).toMatchObject({ operation: "update", value: { status: "cancelled" } });
    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["status", "queued"]);
    expect(cancelled?.status).toBe("cancelled");
  });
});
