import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

/**
 * Regenerates the committed catalog from the HyperFrames registry.
 *
 * Discovery (`catalog.json`) comes from the pinned CLI. Inspection (`catalog-details.json`) comes from
 * the registry manifests, and the entry HTML is read only for its declared variables: the binary
 * assets a block ships are never downloaded here. Both files are committed and read offline at plan
 * time; only compilation resolves a block's real files.
 *
 * Pinned to the same version as `@hyperframes/producer`, so the catalog never describes a format the
 * renderer cannot produce.
 */
const HYPERFRAMES_CLI = "hyperframes@0.8.59";
const DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry";
const TYPE_DIRS: Readonly<Record<string, string>> = {
  "hyperframes:example": "examples",
  "hyperframes:block": "blocks",
  "hyperframes:component": "components",
};

type RegistryListItem = { name: string; type: string };
type RegistryItemFile = { path: string; target?: string; type: string; url?: string };
type RegistryItem = {
  name: string;
  type: string;
  title?: string;
  description?: string;
  tags?: string[];
  author?: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  registryDependencies?: string[];
  files?: RegistryItemFile[];
};
type CatalogRow = { name: string; type: string; title?: string; description?: string; tags?: string[]; dimensions?: { width: number; height: number }; duration?: number };
type CompositionVariable = { id: string; type: string; role?: string; label?: string; description?: string; default?: unknown };

const run = promisify(execFile);

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), "catalog");
  const registryUrl = DEFAULT_REGISTRY_URL;

  const rows = await readCatalogRows();
  const manifest = await fetchJson<{ items: RegistryListItem[] }>(`${registryUrl}/registry.json`);
  const graded = manifest.items.filter((item) => item.type !== "hyperframes:example");

  const details: Record<string, unknown> = {};
  await inPool(graded, 8, async (entry) => {
    const dir = TYPE_DIRS[entry.type];
    if (!dir) return;
    const item = await fetchJson<RegistryItem>(`${registryUrl}/${dir}/${entry.name}/registry-item.json`);
    details[entry.name] = await toDetails(item, registryUrl, dir);
  });

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "catalog.json"), `${stableJson({ items: sorted(rows) })}\n`, "utf8");
  await writeFile(
    join(outDir, "catalog-details.json"),
    `${stableJson({ cliVersion: HYPERFRAMES_CLI, registryUrl, items: details })}\n`,
    "utf8",
  );

  process.stdout.write(`catalog: ${rows.length} discovery rows, ${Object.keys(details).length} inspected items\n`);
}

async function readCatalogRows(): Promise<CatalogRow[]> {
  const { stdout } = await run("npx", ["--yes", HYPERFRAMES_CLI, "catalog", "--json"], { maxBuffer: 64 * 1024 * 1024, timeout: 300_000 });
  const parsed = JSON.parse(stdout) as CatalogRow[];
  if (!Array.isArray(parsed)) throw new Error("The catalog command did not return an array.");
  return parsed.filter((row) => row.type === "block" || row.type === "component");
}

async function toDetails(item: RegistryItem, registryUrl: string, dir: string): Promise<Record<string, unknown>> {
  const files = (item.files ?? []).map((file) => file.target ?? file.path);
  const entry = (item.files ?? []).find((file) => file.path.endsWith(".html"));
  const variables = entry ? await readVariables(`${registryUrl}/${dir}/${item.name}/${entry.path}`) : [];

  return stripUndefined({
    name: item.name,
    type: item.type === "hyperframes:block" ? "block" : "component",
    title: item.title,
    description: item.description,
    tags: item.tags ?? [],
    author: item.author,
    dimensions: item.dimensions,
    duration: item.duration,
    files,
    registryDependencies: item.registryDependencies ?? [],
    variables,
  });
}

/** The entry HTML declares its slots as a `data-composition-variables` JSON attribute. */
async function readVariables(url: string): Promise<CompositionVariable[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return [];
  const html = await response.text();
  const match = /data-composition-variables\s*=\s*(?:"([\s\S]*?)"|'([\s\S]*?)')/.exec(html);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(htmlDecode(raw)) as CompositionVariable[];
    return Array.isArray(parsed) ? parsed.filter((variable) => typeof variable?.id === "string") : [];
  } catch {
    return [];
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

function htmlDecode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function sorted<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/** Key-sorted output, so regenerating an unchanged catalog produces an unchanged file. */
function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return Object.fromEntries(entries.map(([key, entry]) => [key, sortKeys(entry)]));
}

async function inPool<T>(items: readonly T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

await main();
