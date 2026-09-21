import { describe, expect, it, vi } from "vitest";
import {
  SupabaseVideoBriefRevisionRepository,
  SupabaseVideoStoryboardRevisionRepository,
} from "./supabase-video-revision-repositories";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const BRIEF_ID = "44444444-4444-4444-8444-444444444444";
const STORYBOARD_ID = "55555555-5555-4555-8555-555555555555";
const MESSAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const GENERATED_BY = { profileId: "primary", provider: "9router", model: "router-model", promptVersion: "interviewer-v1", requestId: "req-1" };
const BRIEF = { productName: "Kopi Susu", callToAction: "Pesan sekarang" };
const SCENES = [
  { order: 1, startSeconds: 0, endSeconds: 10, visual: "Produk di meja", assetIds: [ASSET_ID] },
];
const APPROVAL_SNAPSHOT = { storyboardRevisionId: STORYBOARD_ID, totalDurationSeconds: 10, scenes: SCENES };

const BRIEF_ROW = {
  id: BRIEF_ID,
  project_id: PROJECT_ID,
  user_id: USER_ID,
  version: 2,
  schema_version: "brief@v1",
  brief: BRIEF,
  is_complete: true,
  generated_by: GENERATED_BY,
  source_message_ids: [MESSAGE_ID],
  created_at: "2026-09-21T00:00:00.000Z",
};

const BRIEF_INPUT = {
  projectId: PROJECT_ID,
  userId: USER_ID,
  schemaVersion: "brief@v1",
  brief: BRIEF,
  isComplete: true,
  generatedBy: GENERATED_BY,
  sourceMessageIds: [MESSAGE_ID],
};

const STORYBOARD_ROW = {
  id: STORYBOARD_ID,
  project_id: PROJECT_ID,
  user_id: USER_ID,
  version: 1,
  schema_version: "storyboard@v1",
  brief_revision_id: BRIEF_ID,
  scenes: SCENES,
  total_duration_seconds: 10,
  generated_by: GENERATED_BY,
  approved_at: null,
  approval_snapshot: null,
  created_at: "2026-09-21T00:00:00.000Z",
};

const STORYBOARD_INPUT = {
  projectId: PROJECT_ID,
  userId: USER_ID,
  schemaVersion: "storyboard@v1",
  briefRevisionId: BRIEF_ID,
  scenes: SCENES,
  totalDurationSeconds: 10,
  generatedBy: GENERATED_BY,
};

const VERSION_CONFLICT = { code: "23505", message: 'duplicate key value violates unique constraint "video_brief_revisions_project_id_version_key"' };

type Response = { data: unknown; error: unknown };
type Filter = [string, unknown] | [string, string, unknown];
type RecordedCall = {
  table: string;
  operation: string;
  value?: unknown;
  filters: Filter[];
  order?: unknown;
  limit?: unknown;
};

/**
 * Chain spy: every `from(table)` starts a fresh recorded call, and each terminal operation
 * (`maybeSingle`, `single`, or awaiting the builder) pops the next scripted response, so the
 * version read / insert / retry sequence each repository issues is described explicitly.
 */
function makeClient(responses: Response[]) {
  const calls: RecordedCall[] = [];
  const pending = [...responses];
  const next = (): Response => pending.shift() ?? { data: null, error: null };

  const client = {
    from: vi.fn((table: string) => {
      const call: RecordedCall = { table, operation: "select", filters: [] };
      calls.push(call);

      const builder = {
        select: vi.fn(() => builder),
        insert: vi.fn((value: unknown) => { call.operation = "insert"; call.value = value; return builder; }),
        update: vi.fn((value: unknown) => { call.operation = "update"; call.value = value; return builder; }),
        eq: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
        order: vi.fn((column: string, options?: unknown) => { call.order = [column, options]; return builder; }),
        limit: vi.fn((count: number) => { call.limit = count; return builder; }),
        maybeSingle: vi.fn(async () => next()),
        single: vi.fn(async () => next()),
        then: (resolve: (value: Response) => unknown) => resolve(next()),
      };

      return builder;
    }),
  };

  return { client, calls, pending };
}

describe("SupabaseVideoBriefRevisionRepository", () => {
  it("writes max(version) + 1 for the project and maps the row back", async () => {
    const { client, calls } = makeClient([
      { data: { version: 2 }, error: null },
      { data: { ...BRIEF_ROW, version: 3 }, error: null },
    ]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    const revision = await repository.create(BRIEF_INPUT);

    // The version read is scoped to the project and takes the highest existing revision.
    expect(calls[0]?.table).toBe("video_brief_revisions");
    expect(calls[0]?.filters).toContainEqual(["project_id", PROJECT_ID]);
    expect(calls[0]?.order).toEqual(["version", { ascending: false }]);
    expect(calls[0]?.limit).toBe(1);

    expect(calls[1]?.operation).toBe("insert");
    expect(calls[1]?.value).toEqual({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      version: 3,
      schema_version: "brief@v1",
      brief: BRIEF,
      is_complete: true,
      generated_by: GENERATED_BY,
      source_message_ids: [MESSAGE_ID],
    });
    expect(revision).toEqual({
      id: BRIEF_ID,
      projectId: PROJECT_ID,
      userId: USER_ID,
      version: 3,
      schemaVersion: "brief@v1",
      brief: BRIEF,
      isComplete: true,
      generatedBy: GENERATED_BY,
      sourceMessageIds: [MESSAGE_ID],
      createdAt: BRIEF_ROW.created_at,
    });
  });

  it("starts at version 1 when the project has no revisions yet", async () => {
    const { client, calls } = makeClient([
      { data: null, error: null },
      { data: { ...BRIEF_ROW, version: 1 }, error: null },
    ]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    const revision = await repository.create(BRIEF_INPUT);

    expect(calls[1]?.value).toMatchObject({ version: 1 });
    expect(revision.version).toBe(1);
  });

  it("retries once on a version conflict, re-reading the project maximum", async () => {
    const { client, calls } = makeClient([
      { data: { version: 4 }, error: null },
      { data: null, error: VERSION_CONFLICT },
      { data: { version: 5 }, error: null },
      { data: { ...BRIEF_ROW, version: 6 }, error: null },
    ]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    const revision = await repository.create(BRIEF_INPUT);

    expect(calls).toHaveLength(4);
    expect(calls[1]?.operation).toBe("insert");
    expect(calls[1]?.value).toMatchObject({ version: 5 });
    expect(calls[2]?.operation).toBe("select");
    expect(calls[3]?.operation).toBe("insert");
    expect(calls[3]?.value).toMatchObject({ version: 6 });
    expect(revision.version).toBe(6);
  });

  it("surfaces a second consecutive version conflict instead of retrying again", async () => {
    const { client, calls } = makeClient([
      { data: { version: 1 }, error: null },
      { data: null, error: VERSION_CONFLICT },
      { data: { version: 1 }, error: null },
      { data: null, error: VERSION_CONFLICT },
    ]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    await expect(repository.create(BRIEF_INPUT)).rejects.toMatchObject({ code: "23505" });
    expect(calls).toHaveLength(4);
  });

  it("rethrows a non-conflict error without retrying", async () => {
    const failure = { code: "23503", message: "insert or update on table \"video_brief_revisions\" violates foreign key constraint" };
    const { client, calls, pending } = makeClient([
      { data: { version: 0 }, error: null },
      { data: null, error: failure },
    ]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    await expect(repository.create(BRIEF_INPUT)).rejects.toBe(failure);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.operation).toBe("insert");
    expect(pending).toHaveLength(0);
  });

  it("scopes the latest brief revision to the project and owner, newest first", async () => {
    const { client, calls } = makeClient([{ data: BRIEF_ROW, error: null }]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    const revision = await repository.latestOwned(PROJECT_ID, USER_ID);

    expect(calls[0]?.filters).toContainEqual(["project_id", PROJECT_ID]);
    expect(calls[0]?.filters).toContainEqual(["user_id", USER_ID]);
    expect(calls[0]?.order).toEqual(["version", { ascending: false }]);
    expect(calls[0]?.limit).toBe(1);
    expect(revision).toMatchObject({ id: BRIEF_ID, projectId: PROJECT_ID, userId: USER_ID, version: 2, isComplete: true });
  });

  it("scopes a brief revision read by revision id and owner", async () => {
    const { client, calls } = makeClient([{ data: BRIEF_ROW, error: null }]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    const revision = await repository.getOwned(BRIEF_ID, USER_ID);

    expect(calls[0]?.table).toBe("video_brief_revisions");
    expect(calls[0]?.filters).toContainEqual(["id", BRIEF_ID]);
    expect(calls[0]?.filters).toContainEqual(["user_id", USER_ID]);
    expect(revision).toMatchObject({ id: BRIEF_ID, version: 2 });
  });

  it("returns null when an owner-scoped brief read matches no row", async () => {
    const latest = makeClient([{ data: null, error: null }]);
    const owned = makeClient([{ data: null, error: null }]);

    await expect(new SupabaseVideoBriefRevisionRepository(latest.client as never).latestOwned(PROJECT_ID, USER_ID)).resolves.toBeNull();
    await expect(new SupabaseVideoBriefRevisionRepository(owned.client as never).getOwned(BRIEF_ID, USER_ID)).resolves.toBeNull();
  });

  it("propagates a read failure", async () => {
    const failure = { code: "42501", message: "permission denied for table video_brief_revisions" };
    const { client } = makeClient([{ data: null, error: failure }]);
    const repository = new SupabaseVideoBriefRevisionRepository(client as never);

    await expect(repository.latestOwned(PROJECT_ID, USER_ID)).rejects.toBe(failure);
  });
});

describe("SupabaseVideoStoryboardRevisionRepository", () => {
  it("writes max(version) + 1 and the project's duration", async () => {
    const { client, calls } = makeClient([
      { data: { version: 0 }, error: null },
      { data: STORYBOARD_ROW, error: null },
    ]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    const revision = await repository.create(STORYBOARD_INPUT);

    expect(calls[0]?.table).toBe("video_storyboard_revisions");
    expect(calls[0]?.filters).toContainEqual(["project_id", PROJECT_ID]);
    expect(calls[0]?.order).toEqual(["version", { ascending: false }]);
    expect(calls[0]?.limit).toBe(1);

    expect(calls[1]?.operation).toBe("insert");
    expect(calls[1]?.value).toEqual({
      project_id: PROJECT_ID,
      user_id: USER_ID,
      version: 1,
      schema_version: "storyboard@v1",
      brief_revision_id: BRIEF_ID,
      scenes: SCENES,
      total_duration_seconds: 10,
      generated_by: GENERATED_BY,
    });
    expect(revision).toEqual({
      id: STORYBOARD_ID,
      projectId: PROJECT_ID,
      userId: USER_ID,
      version: 1,
      schemaVersion: "storyboard@v1",
      briefRevisionId: BRIEF_ID,
      scenes: SCENES,
      totalDurationSeconds: 10,
      generatedBy: GENERATED_BY,
      createdAt: STORYBOARD_ROW.created_at,
    });
    expect(revision).not.toHaveProperty("approvedAt");
    expect(revision).not.toHaveProperty("approvalSnapshot");
  });

  it("retries once on a version conflict, re-reading the project maximum", async () => {
    const { client, calls } = makeClient([
      { data: { version: 2 }, error: null },
      { data: null, error: { ...VERSION_CONFLICT, message: 'duplicate key value violates unique constraint "video_storyboard_revisions_project_id_version_key"' } },
      { data: { version: 3 }, error: null },
      { data: { ...STORYBOARD_ROW, version: 4 }, error: null },
    ]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    const revision = await repository.create(STORYBOARD_INPUT);

    expect(calls).toHaveLength(4);
    expect(calls[1]?.value).toMatchObject({ version: 3 });
    expect(calls[3]?.value).toMatchObject({ version: 4 });
    expect(revision.version).toBe(4);
  });

  it("surfaces a second consecutive version conflict instead of retrying again", async () => {
    const { client, calls } = makeClient([
      { data: { version: 1 }, error: null },
      { data: null, error: VERSION_CONFLICT },
      { data: { version: 1 }, error: null },
      { data: null, error: VERSION_CONFLICT },
    ]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    await expect(repository.create(STORYBOARD_INPUT)).rejects.toMatchObject({ code: "23505" });
    expect(calls).toHaveLength(4);
  });

  it("rethrows a non-conflict error without retrying", async () => {
    const failure = { code: "23514", message: "new row violates check constraint" };
    const { client, calls, pending } = makeClient([
      { data: { version: 1 }, error: null },
      { data: null, error: failure },
    ]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    await expect(repository.create(STORYBOARD_INPUT)).rejects.toBe(failure);
    expect(calls).toHaveLength(2);
    expect(pending).toHaveLength(0);
  });

  it("refuses a duration the column cannot store before inserting a row", async () => {
    const { client, calls } = makeClient([{ data: { version: 0 }, error: null }]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    await expect(repository.create({ ...STORYBOARD_INPUT, totalDurationSeconds: 7 }))
      .rejects.toThrow("The storyboard duration is not one of the supported video durations.");
    expect(calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("scopes the latest storyboard revision to the project and owner, newest first", async () => {
    const { client, calls } = makeClient([{ data: STORYBOARD_ROW, error: null }]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    const revision = await repository.latestOwned(PROJECT_ID, USER_ID);

    expect(calls[0]?.filters).toContainEqual(["project_id", PROJECT_ID]);
    expect(calls[0]?.filters).toContainEqual(["user_id", USER_ID]);
    expect(calls[0]?.order).toEqual(["version", { ascending: false }]);
    expect(calls[0]?.limit).toBe(1);
    expect(revision).toMatchObject({ id: STORYBOARD_ID, version: 1, totalDurationSeconds: 10 });
  });

  it("scopes a storyboard revision read by revision id and owner", async () => {
    const { client, calls } = makeClient([{ data: STORYBOARD_ROW, error: null }]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    const revision = await repository.getOwned(STORYBOARD_ID, USER_ID);

    expect(calls[0]?.table).toBe("video_storyboard_revisions");
    expect(calls[0]?.filters).toContainEqual(["id", STORYBOARD_ID]);
    expect(calls[0]?.filters).toContainEqual(["user_id", USER_ID]);
    expect(revision).toMatchObject({ id: STORYBOARD_ID, briefRevisionId: BRIEF_ID });
  });

  it("approves a revision by writing only the two column-scoped grants", async () => {
    const approvedAt = "2026-09-21T01:00:00.000Z";
    const { client, calls } = makeClient([
      { data: { ...STORYBOARD_ROW, approved_at: approvedAt, approval_snapshot: APPROVAL_SNAPSHOT }, error: null },
    ]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    const revision = await repository.approve(STORYBOARD_ID, USER_ID, approvedAt, APPROVAL_SNAPSHOT);

    expect(calls[0]?.table).toBe("video_storyboard_revisions");
    expect(calls[0]?.operation).toBe("update");
    // The exact payload: `approve` may only ever touch the columns the database grants.
    expect(calls[0]?.value).toEqual({ approved_at: approvedAt, approval_snapshot: APPROVAL_SNAPSHOT });
    expect(Object.keys(calls[0]?.value as object).sort()).toEqual(["approval_snapshot", "approved_at"]);
    // Owner scoping travels with the write.
    expect(calls[0]?.filters).toContainEqual(["id", STORYBOARD_ID]);
    expect(calls[0]?.filters).toContainEqual(["user_id", USER_ID]);
    expect(revision).toMatchObject({ id: STORYBOARD_ID, approvedAt, approvalSnapshot: APPROVAL_SNAPSHOT });
  });

  it("returns null from approve when the caller does not own the revision", async () => {
    const { client, calls } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseVideoStoryboardRevisionRepository(client as never);

    await expect(repository.approve(STORYBOARD_ID, "99999999-9999-4999-8999-999999999999", "2026-09-21T01:00:00.000Z", APPROVAL_SNAPSHOT)).resolves.toBeNull();
    expect(calls[0]?.filters).toContainEqual(["user_id", "99999999-9999-4999-8999-999999999999"]);
    expect(calls[0]?.filters).toContainEqual(["id", STORYBOARD_ID]);
  });

  it("returns null when an owner-scoped storyboard read matches no row", async () => {
    const latest = makeClient([{ data: null, error: null }]);
    const owned = makeClient([{ data: null, error: null }]);

    await expect(new SupabaseVideoStoryboardRevisionRepository(latest.client as never).latestOwned(PROJECT_ID, USER_ID)).resolves.toBeNull();
    await expect(new SupabaseVideoStoryboardRevisionRepository(owned.client as never).getOwned(STORYBOARD_ID, USER_ID)).resolves.toBeNull();
  });
});
