import { describe, expect, it, vi } from "vitest";
import { SupabaseVideoProjectRepository } from "./supabase-video-project-repository";

const ROW = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: "11111111-1111-4111-8111-111111111111",
  title: "Promo Kopi",
  video_type: "product_promo",
  style_id: "bold_pop",
  duration_seconds: 6,
  aspect_ratio: "9:16",
  resolution: "720p",
  language: "id",
  voice_over_enabled: true,
  music_enabled: true,
  status: "draft",
  revision_render_count: 0,
  deleted_at: null,
  created_at: "2026-09-21T00:00:00.000Z",
  updated_at: "2026-09-21T00:00:00.000Z",
};

type Filter = [string, unknown] | [string, string, unknown];
type RecordedCall = { table: string; operation: string; value?: unknown; filters: Filter[] };

/**
 * Records the most recently started query in `calls[0]`. `consumeRerender` reads the row and then
 * issues a guarded write, and the assertions below describe that write.
 */
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
    is: vi.fn((column: string, value: unknown) => { call.filters.push([column, value]); return builder; }),
    /** `lt(column, value)` normalizes to the `column < value` filter it produces. */
    lt: vi.fn((column: string, value: unknown) => { call.filters.push([column, "<", value]); return builder; }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    single: vi.fn(async () => ({ data: result, error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: result, error: null }),
  };

  return builder;
}

describe("SupabaseVideoProjectRepository", () => {
  it("qualifies every read by owner and hides soft-deleted rows", async () => {
    const { client, calls } = makeClient();
    const repository = new SupabaseVideoProjectRepository(client as never);

    await repository.getOwned(ROW.id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["id", ROW.id]);
    expect(calls[0]?.filters).toContainEqual(["user_id", ROW.user_id]);
    expect(calls[0]?.filters).toContainEqual(["deleted_at", null]);
  });

  it("scopes a transition to the expected current status", async () => {
    const { client, calls } = makeClient({ ...ROW, status: "approved" });
    const repository = new SupabaseVideoProjectRepository(client as never);

    await repository.transition(ROW.id, ROW.user_id, "approved", "rendering");

    expect(calls[0]).toMatchObject({ operation: "update", value: { status: "rendering" } });
    expect(calls[0]?.filters).toContainEqual(["status", "approved"]);
  });

  it("returns null when a transition matched no row", async () => {
    const { client } = makeClient(null);
    const repository = new SupabaseVideoProjectRepository(client as never);

    await expect(repository.transition(ROW.id, ROW.user_id, "approved", "rendering")).resolves.toBeNull();
  });

  it("only consumes a rerender while the counter is below the PRD limit", async () => {
    const { client, calls } = makeClient({ ...ROW, revision_render_count: 1 });
    const repository = new SupabaseVideoProjectRepository(client as never);

    await repository.consumeRerender(ROW.id, ROW.user_id);

    expect(calls[0]?.filters).toContainEqual(["revision_render_count", "<", 3]);
  });
});
