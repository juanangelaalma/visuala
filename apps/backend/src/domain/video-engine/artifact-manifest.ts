import { z } from "zod";

/** Written last, so a torn upload never looks like a complete artifact. */
export const ARTIFACT_MANIFEST_FILE = "artifact-manifest.json";

export const ARTIFACT_MANIFEST_VERSION = 1;

const manifestSchema = z
  .object({
    manifestVersion: z.literal(ARTIFACT_MANIFEST_VERSION),
    compositionHash: z.string().regex(/^[0-9a-f]{64}$/),
    files: z
      .array(
        z
          .object({
            path: z.string().trim().min(1),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            byteSize: z.number().int().nonnegative(),
            mimeType: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type ArtifactManifest = z.infer<typeof manifestSchema>;
export type ArtifactManifestFile = ArtifactManifest["files"][number];

export class ArtifactManifestError extends Error {
  constructor(readonly code: "artifact_manifest_invalid" | "artifact_manifest_mismatch", message: string) {
    super(message);
    this.name = "ArtifactManifestError";
  }
}

/** The storage prefix a frozen artifact lives under, keyed by its own hash. */
export function compositionArtifactPrefix(projectId: string, compositionHash: string): string {
  return `video-compositions/${projectId}/${compositionHash}`;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  woff2: "font/woff2",
};

/** The bucket only accepts a known allowlist, so an unknown extension is a refusal rather than an upload that fails late. */
export function mimeTypeForPath(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const mimeType = MIME_TYPES[extension];
  if (mimeType === undefined) throw new ArtifactManifestError("artifact_manifest_invalid", `No content type is known for ${path}.`);
  return mimeType;
}

export function parseArtifactManifest(value: unknown): ArtifactManifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) throw new ArtifactManifestError("artifact_manifest_invalid", "The artifact manifest is not valid.");
  return parsed.data;
}

export function serializeArtifactManifest(manifest: ArtifactManifest): string {
  return JSON.stringify(manifest);
}

/**
 * The manifest is the artifact's index and its integrity record: the worker downloads exactly these files
 * and checks each hash, so an object overwritten after approval cannot reach a render.
 */
export function assertManifestMatchesHash(manifest: ArtifactManifest, compositionHash: string): void {
  if (manifest.compositionHash !== compositionHash) {
    throw new ArtifactManifestError(
      "artifact_manifest_mismatch",
      `The stored artifact declares ${manifest.compositionHash}, but the database recorded ${compositionHash}.`,
    );
  }
}
