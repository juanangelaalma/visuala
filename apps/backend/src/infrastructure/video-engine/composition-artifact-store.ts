import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ARTIFACT_MANIFEST_FILE,
  ARTIFACT_MANIFEST_VERSION,
  ArtifactManifestError,
  assertManifestMatchesHash,
  mimeTypeForPath,
  parseArtifactManifest,
  serializeArtifactManifest,
  type ArtifactManifest,
} from "../../domain/video-engine/artifact-manifest";
import { sha256Hex } from "../../domain/video-engine/hash";
import type { Database } from "@visuala/db";

export type ArtifactFile = { path: string; bytes: Uint8Array };

export type RemoteArtifactFile = ArtifactFile & { sha256: string; mimeType: string };

export interface CompositionArtifactStore {
  /** Uploads the directory and then its manifest. Re-uploading an identical artifact is a no-op. */
  write(prefix: string, input: { compositionHash: string; files: readonly ArtifactFile[] }): Promise<ArtifactManifest>;
  /** Downloads every file the manifest lists and refuses to return bytes that do not match it. */
  read(prefix: string, input: { compositionHash: string; maxBytesPerFile: number }): Promise<RemoteArtifactFile[]>;
}

export class SupabaseCompositionArtifactStore implements CompositionArtifactStore {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly bucket: string,
  ) {}

  async write(prefix: string, input: { compositionHash: string; files: readonly ArtifactFile[] }): Promise<ArtifactManifest> {
    const files = input.files.map((file) => ({
      path: file.path,
      sha256: sha256Hex(file.bytes),
      byteSize: file.bytes.byteLength,
      mimeType: mimeTypeForPath(file.path),
    }));

    for (const file of input.files) {
      const { error } = await this.client.storage.from(this.bucket).upload(`${prefix}/${file.path}`, file.bytes, {
        contentType: mimeTypeForPath(file.path),
        upsert: false,
      });
      // A duplicate means the same content-addressed artifact is already stored, which is the goal.
      if (error && !isDuplicateObjectError(error)) throw error;
    }

    const manifest: ArtifactManifest = { manifestVersion: ARTIFACT_MANIFEST_VERSION, compositionHash: input.compositionHash, files };
    const { error } = await this.client.storage.from(this.bucket)
      .upload(`${prefix}/${ARTIFACT_MANIFEST_FILE}`, serializeArtifactManifest(manifest), { contentType: "application/json", upsert: true });
    if (error) throw error;

    return manifest;
  }

  async read(prefix: string, input: { compositionHash: string; maxBytesPerFile: number }): Promise<RemoteArtifactFile[]> {
    const manifest = parseArtifactManifest(await this.downloadJson(`${prefix}/${ARTIFACT_MANIFEST_FILE}`));
    assertManifestMatchesHash(manifest, input.compositionHash);

    const files: RemoteArtifactFile[] = [];
    for (const entry of manifest.files) {
      const bytes = await this.download(`${prefix}/${entry.path}`, input.maxBytesPerFile);
      if (sha256Hex(bytes) !== entry.sha256) {
        throw new ArtifactManifestError("artifact_manifest_mismatch", `The stored ${entry.path} no longer matches the artifact that was approved.`);
      }
      files.push({ path: entry.path, bytes, sha256: entry.sha256, mimeType: entry.mimeType });
    }
    return files;
  }

  private async download(key: string, maxBytes: number): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error) throw error;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(`${key} is larger than the artifact reader allows.`);
    return bytes;
  }

  private async downloadJson(key: string): Promise<unknown> {
    const bytes = await this.download(key, 8 * 1024 * 1024);
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ArtifactManifestError("artifact_manifest_invalid", "The artifact manifest is not readable.");
    }
  }
}

/** Supabase Storage answers 409 when the object already exists and `upsert` is off. */
function isDuplicateObjectError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { statusCode?: unknown }).statusCode === "409";
}
