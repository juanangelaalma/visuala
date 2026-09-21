import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ASSET_BUCKET, SupabaseAssetObjectStore, readAssetBucket } from "./supabase-asset-object-store";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260922000000_rename_asset_bucket.sql"), "utf8");

describe("video asset bucket migration", () => {
  it("creates one private bucket with an image-only allowlist", () => {
    expect(migration).toMatch(/insert into storage\.buckets[\s\S]*values \('assets', 'assets', false/i);
    expect(migration).toMatch(/allowed_mime_types[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/i);
  });

  it("drops the legacy bucket only when it holds no objects", () => {
    expect(migration).toMatch(/if not exists \(select 1 from storage\.objects where bucket_id = 'video-assets'\)[\s\S]*delete from storage\.buckets where id = 'video-assets'/i);
    expect(migration).toMatch(/else[\s\S]*raise exception/i);
  });

  it("grants no storage.objects access to browser roles", () => {
    expect(migration).not.toMatch(/create policy[\s\S]*to (anon|authenticated)/i);
  });
});

describe("SupabaseAssetObjectStore", () => {
  it("uploads with the bucket, key, content type, and upsert disabled", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "video-projects/p-1/a-1.png" }, error: null });
    const store = new SupabaseAssetObjectStore({ storage: { from: () => ({ upload }) } } as never, DEFAULT_ASSET_BUCKET);

    await store.write("video-projects/p-1/a-1.png", Uint8Array.from([1, 2, 3]), "image/png");

    expect(upload).toHaveBeenCalledWith("video-projects/p-1/a-1.png", expect.any(Uint8Array), { contentType: "image/png", upsert: false });
  });

  it("rejects a stored object larger than the caller's limit", async () => {
    const bytes = new Uint8Array(11);
    const store = new SupabaseAssetObjectStore(
      { storage: { from: () => ({ download: vi.fn().mockResolvedValue({ data: new Blob([bytes]), error: null }) }) } } as never,
      DEFAULT_ASSET_BUCKET,
    );

    await expect(store.read("key", 10)).rejects.toThrowError("Asset object is too large.");
  });

  it("defaults the bucket and honours an explicit override", () => {
    expect(readAssetBucket({})).toBe(DEFAULT_ASSET_BUCKET);
    expect(readAssetBucket({ SUPABASE_ASSET_BUCKET: "custom" })).toBe("custom");
  });
});
