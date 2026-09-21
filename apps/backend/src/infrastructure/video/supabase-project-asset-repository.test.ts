import { describe, expect, it, vi } from "vitest";
import { SupabaseProjectAssetRepository } from "./supabase-project-asset-repository";

const ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  project_id: "33333333-3333-4333-8333-333333333333",
  user_id: "11111111-1111-4111-8111-111111111111",
  object_key: "video-projects/33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222.png",
  mime_type: "image/png",
  byte_size: 68,
  sha256: "0".repeat(64),
  width: 2,
  height: 3,
  rights_confirmed_at: "2026-09-21T00:00:00.000Z",
  moderation_status: "pending",
  deleted_at: null,
  created_at: "2026-09-21T00:00:00.000Z",
};

const INPUT = {
  id: ROW.id,
  projectId: ROW.project_id,
  userId: ROW.user_id,
  objectKey: ROW.object_key,
  mimeType: "image/png" as const,
  byteSize: ROW.byte_size,
  sha256: ROW.sha256,
  width: ROW.width,
  height: ROW.height,
  rightsConfirmedAt: ROW.rights_confirmed_at,
};

type Filter = [string, unknown] | [string, string, unknown];
type RecordedCall = { table: string; operation: string; value?: unknown; filters: Filter[]; order?: unknown };

function makeClient(result: unknown = ROW) {
  const calls: RecordedCall[] = [];
  const client = { calls, from: vi.fn((table: string) => chain(table, result, calls)) };
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
    is: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
    order: vi.fn((column: string) => { call.order = column; return builder; }),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    single: vi.fn(async () => ({ data: result, error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: result, error: null }),
  };

  return builder;
}

describe("SupabaseProjectAssetRepository", () => {
  it("qualifies an asset read by owner and hides soft-deleted rows", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseProjectAssetRepository(client as never);

    const asset = await repository.getOwned(ROW.id, ROW.user_id);

    expect(calls[0]?.table).toBe("video_project_assets");
    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["deleted_at", null]);
    expect(asset).toMatchObject({ id: ROW.id, projectId: ROW.project_id, userId: ROW.user_id, mimeType: "image/png", moderationStatus: "pending" });
  });

  it("scopes a listing to the caller's project, hides deleted rows, and orders by creation", async () => {
    const { client, calls } = makeClient([ROW]);
    const repository = new SupabaseProjectAssetRepository(client as never);

    await repository.listOwned(ROW.project_id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["project_id", ROW.project_id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["deleted_at", null]);
    expect(calls[0]?.order).toBe("created_at");
  });

  it("sums the bytes of active rows only", async () => {
    const { client, calls } = makeClient([{ byte_size: 32 }, { byte_size: 10 }]);
    const repository = new SupabaseProjectAssetRepository(client as never);

    await expect(repository.sumActiveBytes(ROW.project_id, ROW.user_id)).resolves.toBe(42);
    expect(calls[0]?.filters).toContainEqual(["project_id", ROW.project_id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["deleted_at", null]);
  });

  it("hides a soft-deleted row from a read", async () => {
    const { client } = makeClient(null);
    const repository = new SupabaseProjectAssetRepository(client as never);

    await expect(repository.getOwned(ROW.id, ROW.user_id)).resolves.toBeNull();
  });

  it("inserts the caller's ids and leaves moderation to the database default", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseProjectAssetRepository(client as never);

    const asset = await repository.create(INPUT);

    expect(calls[0]).toMatchObject({ table: "video_project_assets", operation: "insert" });
    expect(calls[0]?.value).toEqual({
      id: ROW.id,
      project_id: ROW.project_id,
      user_id: ROW.user_id,
      object_key: ROW.object_key,
      mime_type: "image/png",
      byte_size: ROW.byte_size,
      sha256: ROW.sha256,
      width: ROW.width,
      height: ROW.height,
      rights_confirmed_at: ROW.rights_confirmed_at,
    });
    expect(calls[0]?.value).not.toHaveProperty("moderation_status");
    expect(asset).toMatchObject({ id: ROW.id, objectKey: ROW.object_key });
  });

  it("soft deletes only a row the caller owns", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseProjectAssetRepository(client as never);

    await repository.softDelete(ROW.id, ROW.user_id);

    expect(calls[0]?.operation).toBe("update");
    expect(calls[0]?.value).toHaveProperty("deleted_at");
    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["deleted_at", null]);
  });

  it("returns the internal object key and never a public or signed URL", async () => {
    const { client } = makeClient();
    const repository = new SupabaseProjectAssetRepository(client as never);

    const asset = await repository.getOwned(ROW.id, ROW.user_id);
    const serialized = JSON.stringify(asset);

    expect(asset?.objectKey).toBe(ROW.object_key);
    expect(serialized).toContain(ROW.object_key);
    expect(serialized).not.toMatch(/url/i);
    expect(serialized).not.toContain("http");
  });
});
