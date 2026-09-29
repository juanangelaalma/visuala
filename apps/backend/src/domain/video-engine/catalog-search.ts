import { ASPECT_RATIO_VALUES, catalogItemAspectRatio } from "../../domain/video-engine/catalog";
import type { Catalog, CatalogItem, CatalogItemDetails } from "../../domain/video-engine/catalog";

export type CatalogSearchOptions = {
  type?: "block" | "component";
  /** Keeps only items authored at that frame shape; an unshaped item is kept. */
  aspectRatio?: string;
  limit?: number;
  ratioTolerance?: number;
};

export type CatalogSearchResult = CatalogItem & { score: number };

const DEFAULT_LIMIT = 10;
const DEFAULT_RATIO_TOLERANCE = 0.02;
const MIN_TOKEN_LENGTH = 2;

/** Field weights, highest first: a name match is worth more than a description match. */
const FIELD_WEIGHTS: readonly (readonly [keyof CatalogItem, number])[] = [
  ["name", 4],
  ["tags", 3],
  ["title", 2],
  ["description", 1],
];

/** Deterministic token-overlap search: the planner asks for a beat and gets a ranked shortlist, never the whole catalog. */
export function searchCatalog(catalog: Catalog, query: string, options: CatalogSearchOptions = {}): CatalogSearchResult[] {
  const tokens = tokenize(query);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const tolerance = options.ratioTolerance ?? DEFAULT_RATIO_TOLERANCE;
  const target = options.aspectRatio === undefined ? null : ASPECT_RATIO_VALUES[options.aspectRatio] ?? null;

  const scored: CatalogSearchResult[] = [];
  for (const item of catalog.items) {
    if (options.type && item.type !== options.type) continue;
    if (target !== null && !ratioMatches(item, target, tolerance)) continue;

    const score = scoreItem(item, tokens, query);
    if (score > 0) scored.push({ ...item, score });
  }

  return scored
    .sort((left, right) => (right.score - left.score) || compareNames(left, right))
    .slice(0, Math.max(0, limit));
}

export function inspectCatalogItem(catalog: Catalog, name: string): CatalogItemDetails | null {
  return catalog.details.get(name) ?? null;
}

export function findCatalogItem(catalog: Catalog, name: string): CatalogItem | null {
  return catalog.items.find((item) => item.name === name) ?? null;
}

/** True when the id is installable: discovery knows it, and it is a block or a component. */
export function catalogItemExists(catalog: Catalog, name: string): boolean {
  return findCatalogItem(catalog, name) !== null;
}

function scoreItem(item: CatalogItem, tokens: readonly string[], query: string): number {
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    for (const [field, weight] of FIELD_WEIGHTS) {
      if (fieldMatches(item[field], token)) {
        score += weight;
        break;
      }
    }
  }

  const phrase = query.trim().toLowerCase();
  const name = item.name.toLowerCase();
  const title = item.title.toLowerCase();
  if (phrase.length > 0 && name.includes(phrase)) score += 6;
  else if (phrase.length > 0 && title.includes(phrase)) score += 3;

  return score;
}

function fieldMatches(value: CatalogItem[keyof CatalogItem], token: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => typeof entry === "string" && entry.toLowerCase().includes(token));
  if (typeof value === "string") return value.toLowerCase().includes(token);
  return false;
}

function tokenize(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= MIN_TOKEN_LENGTH) seen.add(raw);
  }
  return [...seen].sort();
}

function ratioMatches(item: CatalogItem, target: number, tolerance: number): boolean {
  const ratio = catalogItemAspectRatio(item);
  return ratio === null || Math.abs(ratio - target) <= tolerance;
}

function compareNames(left: CatalogItem, right: CatalogItem): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}
