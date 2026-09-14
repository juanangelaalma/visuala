import { describe, expect, it, vi } from "vitest";
import { SupabaseAssetRepository } from "./supabase-asset-repository";

const row = {
  id: "asset-1", user_id: "user-1", object_key: "ai-assets/user-1/asset-1.png",
  mime_type: "image/png", byte_size: 29, sha256: "digest", width: 2, height: 3, validated: true,
  deleted_at: null, created_at: "2026-09-12T00:00:00.000Z",
};

function makeRepository(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "insert", "is"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  const client = { from: vi.fn(() => chain) };
  return { repository: new SupabaseAssetRepository(client as never), client, chain };
}

describe("SupabaseAssetRepository", () => {
  it("maps database rows to camelCase assets without a URL", async () => {
    const { repository } = makeRepository({ data: row, error: null });
    const result = await repository.getOwned("asset-1", "user-1");
    expect(result).toEqual({
      id: "asset-1", userId: "user-1", objectKey: "ai-assets/user-1/asset-1.png",
      mimeType: "image/png", byteSize: 29, sha256: "digest", width: 2, height: 3, validated: true,
      deletedAt: undefined, createdAt: "2026-09-12T00:00:00.000Z",
    });
  });

  it("qualifies ownership queries by asset and user", async () => {
    const { repository, chain } = makeRepository({ data: row, error: null });
    await repository.getOwned("asset-1", "user-1");
    expect(chain.eq.mock.calls).toEqual([["id", "asset-1"], ["user_id", "user-1"]]);
  });

  it("maps asset metadata to snake_case on insert", async () => {
    const { repository, chain } = makeRepository({ data: row, error: null });
    await repository.create({
      id: "asset-1", userId: "user-1", objectKey: "ai-assets/user-1/asset-1.png",
      mimeType: "image/png", byteSize: 29, sha256: "digest", width: 2, height: 3,
    });
    expect(chain.insert).toHaveBeenCalledWith({
      id: "asset-1", user_id: "user-1", object_key: "ai-assets/user-1/asset-1.png",
      mime_type: "image/png", byte_size: 29, sha256: "digest", width: 2, height: 3, validated: true,
    });
  });
});
