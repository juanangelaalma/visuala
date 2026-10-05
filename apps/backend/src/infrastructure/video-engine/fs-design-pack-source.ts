import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DesignPackError, parseDesignPackManifest } from "../../domain/video-engine/design-pack";
import type { DesignPackManifest, DesignPackRef } from "../../domain/video-engine/design-pack";

export type LoadedDesignPack = { manifest: DesignPackManifest; frameMd: string; designMd: string | null };

/** A customer pack in Supabase Storage satisfies the same port later, so nothing downstream knows which one it got. */
export interface DesignPackSource {
  load(ref: DesignPackRef): Promise<LoadedDesignPack>;
}

/** Layout inside a pack directory: `design-packs/<styleId>/v<version>/{frame.md,manifest.json}` with optional `design.md`. */
export function designPackDirectory(rootDir: string, ref: DesignPackRef): string {
  return join(rootDir, "design-packs", ref.id, `v${ref.version}`);
}

export function createFsDesignPackSource(rootDir: string = process.cwd()): DesignPackSource {
  return {
    async load(ref) {
      const directory = designPackDirectory(rootDir, ref);
      const [manifestText, frameMd, designMd] = await Promise.all([
        readText(join(directory, "manifest.json"), ref),
        readText(join(directory, "frame.md"), ref),
        readOptionalText(join(directory, "design.md")),
      ]);
      if (frameMd.trim().length === 0) throw missing(ref);
      return { manifest: parse(manifestText, ref), frameMd, designMd };
    },
  };
}

async function readText(path: string, ref: DesignPackRef): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw missing(ref);
  }
}

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function parse(text: string, ref: DesignPackRef): DesignPackManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw missing(ref);
  }
  return parseDesignPackManifest(value);
}

function missing(ref: DesignPackRef): DesignPackError {
  return new DesignPackError("design_pack_missing", `Design Pack ${ref.id}@${ref.version} is not available.`);
}
