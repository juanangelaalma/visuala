import { describe, expect, it, vi } from "vitest";
import { SupabaseVideoVersionRepository } from "./supabase-version-repository";

const ROW = {
  id: "88888888-8888-4888-8888-888888888888",
  project_id: "33333333-3333-4333-8333-333333333333",
  user_id: "11111111-1111-4111-8111-111111111111",
  version_number: 2,
  render_job_id: "66666666-6666-4666-8666-666666666666",
  parent_version_id: "77777777-7777-4777-8777-777777777777",
  output_object_key: "video-versions/33333333-3333-4333-8333-333333333333/88888888-8888-4888-8888-888888888888.mp4",
  duration_seconds: 10,
  aspect_ratio: "9:16",
  resolution: "1080p",
  manifest_hash: "0".repeat(64),
  created_at: "2026-09-21T00:00:00.000Z",
};

type Filter = [string, unknown];
type RecordedCall = { table: string; operation: string; value?: unknown; filters: Filter[]; order?: [string, boolean | undefined]; limit?: number };

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
    eq: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => { call.order = [column, options?.ascending]; return builder; }),
    limit: vi.fn((count: number) => { call.limit = count; return builder; }),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    single: vi.fn(async () => ({ data: result, error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: result, error: null }),
  };

  return builder;
}

describe("SupabaseVideoVersionRepository", () => {
  it("inserts the version columns and maps the row back", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseVideoVersionRepository(client as never);

    const created = await repository.create({
      id: ROW.id,
      projectId: ROW.project_id,
      userId: ROW.user_id,
      versionNumber: ROW.version_number,
      renderJobId: ROW.render_job_id,
      parentVersionId: ROW.parent_version_id,
      outputObjectKey: ROW.output_object_key,
      durationSeconds: ROW.duration_seconds,
      aspectRatio: ROW.aspect_ratio,
      resolution: ROW.resolution,
      manifestHash: ROW.manifest_hash,
    });

    expect(calls[0]).toMatchObject({
      table: "video_versions",
      operation: "insert",
      value: {
        id: ROW.id,
        project_id: ROW.project_id,
        user_id: ROW.user_id,
        version_number: ROW.version_number,
        render_job_id: ROW.render_job_id,
        parent_version_id: ROW.parent_version_id,
        output_object_key: ROW.output_object_key,
        manifest_hash: ROW.manifest_hash,
      },
    });
    expect(created).toMatchObject({ id: ROW.id, versionNumber: 2, parentVersionId: ROW.parent_version_id, outputObjectKey: ROW.output_object_key });
  });

  it("lists a project's versions newest first and only for the owner", async () => {
    const { client, calls } = makeClient([ROW]);
    const repository = new SupabaseVideoVersionRepository(client as never);

    const versions = await repository.listOwned(ROW.project_id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["project_id", ROW.project_id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.order).toEqual(["version_number", false]);
    expect(versions).toHaveLength(1);
  });

  it("qualifies an owned read by owner and hides a version the caller does not own", async () => {
    const { client, calls } = makeClient(null);
    const repository = new SupabaseVideoVersionRepository(client as never);

    await expect(repository.getOwned(ROW.id, "user-b")).resolves.toBeNull();

    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", "user-b"]);
  });

  it("reads the latest owned version", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseVideoVersionRepository(client as never);

    const latest = await repository.latestOwned(ROW.project_id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["project_id", ROW.project_id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.order).toEqual(["version_number", false]);
    expect(calls[0]?.limit).toBe(1);
    expect(latest?.id).toBe(ROW.id);
  });
});
