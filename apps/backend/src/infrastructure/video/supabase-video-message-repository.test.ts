import { describe, expect, it, vi } from "vitest";
import { SupabaseVideoMessageRepository } from "./supabase-video-message-repository";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const MESSAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const MESSAGE_ROW = {
  id: MESSAGE_ID,
  project_id: PROJECT_ID,
  user_id: USER_ID,
  role: "user" as const,
  content: "buat video jualan produk ini",
  controls: null,
  asset_ids: [] as string[],
  created_at: "2026-09-21T00:00:00.000Z",
};

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
 * (`maybeSingle`, `single`, or awaiting the builder) pops the next scripted response. Assertions
 * describe the query the repository actually issued, not the shape of its implementation.
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

function appendInput(overrides: Partial<Parameters<SupabaseVideoMessageRepository["append"]>[0]> = {}) {
  return {
    id: MESSAGE_ID,
    projectId: PROJECT_ID,
    userId: USER_ID,
    role: "user" as const,
    content: MESSAGE_ROW.content,
    ...overrides,
  };
}

describe("SupabaseVideoMessageRepository", () => {
  it("inserts a user message in snake_case with controls null and no assets by default", async () => {
    const { client, calls } = makeClient([{ data: MESSAGE_ROW, error: null }]);
    const repository = new SupabaseVideoMessageRepository(client as never);

    const message = await repository.append(appendInput());

    expect(calls[0]?.table).toBe("video_messages");
    expect(calls[0]?.operation).toBe("insert");
    expect(calls[0]?.value).toEqual({
      id: MESSAGE_ID,
      project_id: PROJECT_ID,
      user_id: USER_ID,
      role: "user",
      content: MESSAGE_ROW.content,
      controls: null,
      asset_ids: [],
    });
    // Exact column list: no camelCase leak, and `created_at` stays the database clock.
    expect(Object.keys(calls[0]?.value as object).sort()).toEqual([
      "asset_ids", "content", "controls", "id", "project_id", "role", "user_id",
    ]);
    expect(message).toEqual({
      id: MESSAGE_ID,
      projectId: PROJECT_ID,
      userId: USER_ID,
      role: "user",
      content: MESSAGE_ROW.content,
      controls: null,
      assetIds: [],
      createdAt: MESSAGE_ROW.created_at,
    });
  });

  it("carries explicit controls and asset ids through unchanged", async () => {
    const controls = { styleId: "bold_pop", requestedTone: "hangat" };
    const { client, calls } = makeClient([{ data: { ...MESSAGE_ROW, controls, asset_ids: [ASSET_ID] }, error: null }]);
    const repository = new SupabaseVideoMessageRepository(client as never);

    const message = await repository.append(appendInput({ controls, assetIds: [ASSET_ID] }));

    expect(calls[0]?.value).toMatchObject({ controls, asset_ids: [ASSET_ID] });
    expect(calls[0]?.value).not.toHaveProperty("projectId");
    expect(calls[0]?.value).not.toHaveProperty("assetIds");
    expect(message).toMatchObject({ controls, assetIds: [ASSET_ID] });
  });

  it("scopes the conversation to the project and owner and orders by creation ascending", async () => {
    const { client, calls } = makeClient([{ data: [MESSAGE_ROW], error: null }]);
    const repository = new SupabaseVideoMessageRepository(client as never);

    await repository.listOwned(PROJECT_ID, USER_ID);

    expect(calls[0]?.table).toBe("video_messages");
    expect(calls[0]?.operation).toBe("select");
    expect(calls[0]?.filters).toContainEqual(["project_id", PROJECT_ID]);
    expect(calls[0]?.filters).toContainEqual(["user_id", USER_ID]);
    expect(calls[0]?.order).toEqual(["created_at", { ascending: true }]);
  });

  it("maps listed rows to the camelCase VideoMessage shape", async () => {
    const { client } = makeClient([{ data: [MESSAGE_ROW, { ...MESSAGE_ROW, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "assistant" }], error: null }]);
    const repository = new SupabaseVideoMessageRepository(client as never);

    const messages = await repository.listOwned(PROJECT_ID, USER_ID);

    expect(messages).toEqual([
      {
        id: MESSAGE_ID,
        projectId: PROJECT_ID,
        userId: USER_ID,
        role: "user",
        content: MESSAGE_ROW.content,
        controls: null,
        assetIds: [],
        createdAt: MESSAGE_ROW.created_at,
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        projectId: PROJECT_ID,
        userId: USER_ID,
        role: "assistant",
        content: MESSAGE_ROW.content,
        controls: null,
        assetIds: [],
        createdAt: MESSAGE_ROW.created_at,
      },
    ]);
  });

  it("reads an empty conversation as an empty list rather than throwing", async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repository = new SupabaseVideoMessageRepository(client as never);

    await expect(repository.listOwned(PROJECT_ID, USER_ID)).resolves.toEqual([]);
  });

  it("propagates a write failure instead of returning a phantom message", async () => {
    const failure = { code: "23503", message: "insert or update on table \"video_messages\" violates foreign key constraint" };
    const { client } = makeClient([{ data: null, error: failure }]);
    const repository = new SupabaseVideoMessageRepository(client as never);

    await expect(repository.append(appendInput())).rejects.toBe(failure);
  });

  it("propagates a read failure instead of hiding a conversation", async () => {
    const failure = { code: "42501", message: "permission denied for table video_messages" };
    const { client } = makeClient([{ data: null, error: failure }]);
    const repository = new SupabaseVideoMessageRepository(client as never);

    await expect(repository.listOwned(PROJECT_ID, USER_ID)).rejects.toBe(failure);
  });
});
