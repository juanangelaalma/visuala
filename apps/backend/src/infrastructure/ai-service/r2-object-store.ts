import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import type { AssetMimeType, AssetObjectStore } from "@/domain/ai-service/assets";

const configSchema = z.object({ R2_ACCOUNT_ID: z.string().min(1), R2_ACCESS_KEY_ID: z.string().min(1), R2_SECRET_ACCESS_KEY: z.string().min(1), R2_BUCKET: z.string().min(1) });

export class R2ObjectStore implements AssetObjectStore {
  private readonly config;
  private readonly client: S3Client;

  constructor(environment: Readonly<Record<string, string | undefined>> = process.env) {
    this.config = readConfig(environment);
    this.client = new S3Client({ region: "auto", endpoint: `https://${this.config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: this.config.R2_ACCESS_KEY_ID, secretAccessKey: this.config.R2_SECRET_ACCESS_KEY } });
  }

  async write(key: string, bytes: Uint8Array, mimeType: AssetMimeType): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.R2_BUCKET, Key: key, Body: bytes, ContentType: mimeType, ContentLength: bytes.byteLength }));
  }

  async read(key: string, maxBytes: number): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.R2_BUCKET, Key: key }));
    if (!result.Body) throw new Error("Asset object is unavailable.");
    if (result.ContentLength !== undefined && result.ContentLength > maxBytes) throw new Error("Asset object is too large.");
    return readBounded(result.Body as AsyncIterable<Uint8Array>, maxBytes);
  }

  async delete(key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: this.config.R2_BUCKET, Key: key })); }
}

async function readBounded(body: AsyncIterable<Uint8Array>, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error("Asset object is too large.");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function readConfig(environment: Readonly<Record<string, string | undefined>>) { return configSchema.parse({ R2_ACCOUNT_ID: environment.R2_ACCOUNT_ID, R2_ACCESS_KEY_ID: environment.R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY: environment.R2_SECRET_ACCESS_KEY, R2_BUCKET: environment.R2_BUCKET }); }
