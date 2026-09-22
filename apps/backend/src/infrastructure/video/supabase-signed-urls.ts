import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@visuala/db";

export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Mints short-lived URLs only; a signed URL is never stored as a canonical asset reference.
 *
 * A missing object answers `null` instead of throwing. A row can outlive its object (an object
 * removed by hand, or one written before the storage bucket was consolidated under its final name),
 * and one such row used to take down the whole list or download with an unhandled 500. Every other
 * storage failure still throws, so a real outage is never mistaken for an absent object.
 */
export function createSupabaseSignedUrlFactory(
  client: SupabaseClient<Database>,
  bucket: string,
): (objectKey: string) => Promise<string | null> {
  return async (objectKey: string) => {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
    if (error) {
      if (isMissingObjectError(error)) return null;
      throw error;
    }
    if (!data?.signedUrl) throw new Error("Could not sign the object.");
    return data.signedUrl;
  };
}

/** `StorageApiError` carries the HTTP status; only a 404 means the object itself is absent. */
export function isMissingObjectError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { status?: unknown }).status === 404;
}
