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

type Filter = [string, unknown] | [string, string, unknown];
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
    not: vi.fn((column: string, operator: string, value: unknown) => { call.filters.push([column, `not ${operator}`, value]); return builder; }),
    lt: vi.fn((column: string, value: unknown) => { call.filters.push([column, "<", value]); return builder; }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => { call.order = [column, options?.ascending]; return builder; }),
    limit: vi.fn((count: number) => { call.limit = count; return builder; }),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    single: vi.fn(async () => ({ data: result, error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: result, error: null }),
  };

  return builder;
}

type QueueFilter = { kind: "eq" | "in" | "notNull" | "lt"; column: string; value: unknown };

/**
 * A row for the queue-method tests. `started_at` is what separates the claim loop from the reclaimer,
 * so a started status carries a timestamp and a queued one does not.
 */
function jobRow(status: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  // These tests advance `job-1`, so the row carries that id rather than the row fixture's uuid.
  return { ...ROW, id: "job-1", status, started_at: status === "queued" ? null : "2026-09-21T00:00:00.000Z", ...overrides };
}

/** Evaluates one recorded filter against a row. Only the operators these methods use are modelled. */
function rowMatches(row: Record<string, unknown>, filter: QueueFilter): boolean {
  const actual = row[filter.column];
  switch (filter.kind) {
    case "eq":
      return actual === filter.value;
    case "in":
      return (filter.value as unknown[]).includes(actual);
    case "notNull": {
      const [operator, expected] = filter.value as [string, unknown];
      return operator === "is" && expected === null ? actual !== null && actual !== undefined : true;
    }
    case "lt":
      return typeof actual === "string" && typeof filter.value === "string" && actual < filter.value;
  }
}

/**
 * The repository over a fake client that actually honours the filters and the conditional update it
 * is given. That is the point of this helper: a fake that always returns its row cannot tell a query
 * that constrained `status` from one that forgot to, which is exactly the bug these methods carry.
 */
function repositoryWith(status: string, rowOverrides: Record<string, unknown> = {}): SupabaseRenderJobRepository {
  let rows: Record<string, unknown>[] = [jobRow(status, rowOverrides)];

  function createQuery() {
    let operation: "select" | "update" = "select";
    let patch: Record<string, unknown> = {};
    let filters: QueueFilter[] = [];
    const matching = (): Record<string, unknown>[] => rows.filter((row) => filters.every((filter) => rowMatches(row, filter)));

    function resolveOne() {
      const matched = matching();
      if (operation !== "update") return { data: matched[0] ?? null, error: null };
      if (matched.length === 0) return { data: null, error: null };
      const claimed = new Set(matched);
      rows = rows.map((row) => (claimed.has(row) ? { ...row, ...patch } : row));
      return { data: { ...(matched[0] as Record<string, unknown>), ...patch }, error: null };
    }

    const api = {
      select: () => api,
      insert: (value: Record<string, unknown>) => { operation = "update"; patch = value; return api; },
      update: (value: Record<string, unknown>) => { operation = "update"; patch = value; return api; },
      eq: (column: string, value: unknown) => { filters = [...filters, { kind: "eq", column, value }]; return api; },
      in: (column: string, values: unknown[]) => { filters = [...filters, { kind: "in", column, value: values }]; return api; },
      not: (column: string, operator: string, value: unknown) => { filters = [...filters, { kind: "notNull", column, value: [operator, value] }]; return api; },
      lt: (column: string, value: unknown) => { filters = [...filters, { kind: "lt", column, value }]; return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => resolveOne(),
      single: async () => resolveOne(),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: matching(), error: null }),
    };

    return api;
  }

  return new SupabaseRenderJobRepository({ from: () => createQuery() } as never);
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

describe("render job queue methods", () => {
  it("advances a job only from the status it expects", async () => {
    const repository = repositoryWith("preparing");
    await expect(repository.markRendering("job-1")).resolves.toMatchObject({ status: "rendering" });

    // A job that was cancelled or reclaimed under the worker must not be resurrected.
    const cancelled = repositoryWith("cancelled");
    await expect(cancelled.markRendering("job-1")).resolves.toBeNull();
  });

  it("advances rendering to uploading and refuses any other prior status", async () => {
    await expect(repositoryWith("rendering").markUploading("job-1")).resolves.toMatchObject({ status: "uploading" });
    await expect(repositoryWith("preparing").markUploading("job-1")).resolves.toBeNull();
  });

  it("succeeds a job only from uploading, and stamps the finish time", async () => {
    const succeeded = await repositoryWith("uploading").succeed("job-1");
    expect(succeeded).toMatchObject({ status: "succeeded" });
    expect(typeof succeeded?.finishedAt).toBe("string");

    await expect(repositoryWith("rendering").succeed("job-1")).resolves.toBeNull();
  });

  it("returns the newest job for its owner and hides another owner's job", async () => {
    await expect(repositoryWith("rendering").latestOwned(ROW.project_id, ROW.user_id)).resolves.toMatchObject({ id: "job-1" });

    const otherOwner = repositoryWith("rendering", { user_id: "22222222-2222-4222-8222-222222222222" });
    await expect(otherOwner.latestOwned(ROW.project_id, ROW.user_id)).resolves.toBeNull();
  });

  it("finds only started jobs older than the staleness cutoff", async () => {
    const repository = repositoryWith("rendering");
    await expect(repository.listStale("2026-09-22T00:00:00.000Z", 10)).resolves.toHaveLength(1);
    // A queued job has never started and belongs to the claim loop, not the reclaimer.
    const queued = repositoryWith("queued");
    await expect(queued.listStale("2026-09-22T00:00:00.000Z", 10)).resolves.toEqual([]);
  });

  it("orders the queue oldest first, so a backlog drains in the order users asked", async () => {
    const repository = repositoryWith("queued");
    await expect(repository.listQueued(1)).resolves.toHaveLength(1);
  });

  it("constrains the queue and the reclaimer to the columns that make each query correct", async () => {
    // The list reads await the builder, so the fake has to answer with an array.
    const queued = makeClient([]);
    await new SupabaseRenderJobRepository(queued.client as never).listQueued(5);
    expect(queued.calls[0]?.filters).toContainEqual(["status", "queued"]);
    expect(queued.calls[0]?.order).toEqual(["queued_at", true]);
    expect(queued.calls[0]?.limit).toBe(5);

    const stale = makeClient([]);
    await new SupabaseRenderJobRepository(stale.client as never).listStale("2026-09-22T00:00:00.000Z", 10);
    expect(stale.calls[0]?.filters).toContainEqual(["status", "in", ACTIVE_STATUSES]);
    expect(stale.calls[0]?.filters).toContainEqual(["started_at", "not is", null]);
    expect(stale.calls[0]?.filters).toContainEqual(["started_at", "<", "2026-09-22T00:00:00.000Z"]);
    expect(stale.calls[0]?.order).toEqual(["started_at", true]);

    const latest = makeClient();
    await new SupabaseRenderJobRepository(latest.client as never).latestOwned(ROW.project_id, ROW.user_id);
    expect(latest.calls[0]?.filters).toContainEqual(["project_id", ROW.project_id]);
    expect(latest.calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(latest.calls[0]?.order).toEqual(["created_at", false]);
    expect(latest.calls[0]?.limit).toBe(1);
  });
});
