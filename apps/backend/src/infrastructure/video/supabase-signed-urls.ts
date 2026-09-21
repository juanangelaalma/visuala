import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@visuala/db";

export const SIGNED_URL_TTL_SECONDS = 300;

/** Returns short-lived URLs only; a signed URL is never stored as a canonical asset reference. */
export function createSupabaseSignedUrlFactory(client: SupabaseClient<Database>, bucket: string): (objectKey: string) => Promise<string> {
  return async (objectKey: string) => {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw error ?? new Error("Could not sign the object.");
    return data.signedUrl;
  };
}
