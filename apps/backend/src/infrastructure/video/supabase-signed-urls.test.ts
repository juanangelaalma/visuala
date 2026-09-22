import { describe, expect, it, vi } from "vitest";
import { SIGNED_URL_TTL_SECONDS, createSupabaseSignedUrlFactory } from "./supabase-signed-urls";

/** The only client surface the factory touches: `storage.from(bucket).createSignedUrl(key, ttl)`. */
function client(createSignedUrl: ReturnType<typeof vi.fn>) {
  const from = vi.fn(() => ({ createSignedUrl }));
  return { client: { storage: { from } } as never, from };
}

/** The shape `storage-js` raises for a 404 on the object. */
function objectNotFound() {
  return Object.assign(new Error("Object not found"), { name: "StorageApiError", status: 404, statusCode: "404" });
}

describe("createSupabaseSignedUrlFactory", () => {
  it("signs the object key with the short TTL and returns the signed URL", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/video-projects/p/a.png" }, error: null });
    const { client: supabase, from } = client(createSignedUrl);

    const sign = createSupabaseSignedUrlFactory(supabase, "assets");

    await expect(sign("video-projects/p/a.png")).resolves.toBe("https://signed.example/video-projects/p/a.png");
    expect(from).toHaveBeenCalledWith("assets");
    expect(createSignedUrl).toHaveBeenCalledWith("video-projects/p/a.png", SIGNED_URL_TTL_SECONDS);
    // The TTL is the documented 300 seconds, not merely whatever the constant happens to be.
    expect(SIGNED_URL_TTL_SECONDS).toBe(300);
  });

  it("answers null when the object is gone, so one stale row cannot fail a whole list", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: objectNotFound() });
    const { client: supabase } = client(createSignedUrl);

    const sign = createSupabaseSignedUrlFactory(supabase, "assets");

    await expect(sign("video-projects/p/missing.png")).resolves.toBeNull();
  });

  it("still propagates a storage failure that is not a missing object", async () => {
    const failure = Object.assign(new Error("storage unavailable"), { name: "StorageApiError", status: 500, statusCode: "500" });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: failure });
    const { client: supabase } = client(createSignedUrl);

    const sign = createSupabaseSignedUrlFactory(supabase, "assets");

    await expect(sign("video-projects/p/a.png")).rejects.toBe(failure);
  });

  it("rejects rather than yielding an unusable string when storage returns no URL", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: null });
    const { client: supabase } = client(createSignedUrl);

    const sign = createSupabaseSignedUrlFactory(supabase, "assets");

    await expect(sign("video-projects/p/a.png")).rejects.toThrowError("Could not sign the object.");
  });
});
