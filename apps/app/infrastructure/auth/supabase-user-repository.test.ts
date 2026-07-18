import { describe, expect, it, vi } from "vitest";
import { SupabaseUserRepository } from "./supabase-user-repository";

const row = { id: "user-1", email: "user@example.com", full_name: "User", avatar_url: null, role: "user", created_at: "created", updated_at: "updated" };

function makeRepository(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "upsert"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  return { repository: new SupabaseUserRepository({ from: vi.fn(() => chain) } as never), chain };
}

describe("SupabaseUserRepository", () => {
  it("maps profile row", async () => {
    const { repository } = makeRepository({ data: row, error: null });
    expect(await repository.findById("user-1")).toEqual({ id: "user-1", email: "user@example.com", fullName: "User", avatarUrl: null, role: "user", createdAt: "created", updatedAt: "updated" });
  });

  it("returns null for missing profile", async () => {
    const { repository } = makeRepository({ data: null, error: null });
    expect(await repository.findById("missing")).toBeNull();
  });

  it.each(["find", "upsert"])("propagates %s errors", async (method) => {
    const error = new Error("database failed");
    const { repository } = makeRepository({ data: null, error });
    const result = method === "find" ? repository.findById("user-1") : repository.upsert({ id: "user-1", email: "user@example.com" });
    await expect(result).rejects.toBe(error);
  });

  it.each([["admin", { role: "admin" }], [undefined, {}]])("upserts optional role %s", async (role, roleField) => {
    const { repository, chain } = makeRepository({ data: row, error: null });
    await repository.upsert({ id: "user-1", email: "user@example.com", role: role as never });
    expect(chain.upsert.mock.calls[0]?.[0]).toEqual({ id: "user-1", email: "user@example.com", full_name: null, avatar_url: null, ...roleField });
  });
});
