import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AssetMimeType, AssetObjectStore } from "../../domain/ai-service/assets";
import type { Database } from "@visuala/db";

export const DEFAULT_ASSET_BUCKET = "video-assets";

const environmentSchema = z.object({ SUPABASE_ASSET_BUCKET: z.string().trim().min(1).default(DEFAULT_ASSET_BUCKET) });

export function readAssetBucket(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  return environmentSchema.parse({ SUPABASE_ASSET_BUCKET: environment.SUPABASE_ASSET_BUCKET }).SUPABASE_ASSET_BUCKET;
}

export class SupabaseAssetObjectStore implements AssetObjectStore {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly bucket: string = DEFAULT_ASSET_BUCKET,
  ) {}

  async write(key: string, bytes: Uint8Array, mimeType: AssetMimeType): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, bytes, { contentType: mimeType, upsert: false });
    if (error) throw error;
  }

  async read(key: string, maxBytes: number): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error) throw error;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("Asset object is too large.");
    return bytes;
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw error;
  }
}
