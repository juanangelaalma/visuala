import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CatalogError, buildCatalog, parseCatalogDetails, parseCatalogRows } from "../../domain/video-engine/catalog";
import type { Catalog } from "../../domain/video-engine/catalog";

export const CATALOG_DIRECTORY = "catalog";

/** Read offline from the committed files, so a plan never depends on the registry being up. Regenerate with `pnpm catalog:generate`. */
export function createFsCatalogSource(rootDir: string = process.cwd()): { load(): Promise<Catalog> } {
  return {
    async load() {
      const directory = join(rootDir, CATALOG_DIRECTORY);
      const [rows, details] = await Promise.all([
        readJson(join(directory, "catalog.json")),
        readJson(join(directory, "catalog-details.json")),
      ]);
      return buildCatalog(parseCatalogRows(rows), parseCatalogDetails(details));
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new CatalogError("catalog_missing", `The catalog file ${path} is not readable.`);
  }
}
