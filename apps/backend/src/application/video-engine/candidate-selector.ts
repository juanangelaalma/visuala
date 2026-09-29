import { inspectCatalogItem, searchCatalog } from "../../domain/video-engine/catalog-search";
import type { Catalog } from "../../domain/video-engine/catalog";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { VideoRecipe } from "../../domain/video-engine/recipes/types";

export type CatalogCandidateVariable = { id: string; type?: string; role?: string; label?: string };

export type CatalogCandidate = {
  name: string;
  type: "block" | "component";
  title: string;
  description: string;
  dimensions: { width: number; height: number } | null;
  duration: number | null;
  variables: readonly CatalogCandidateVariable[];
  score: number;
  beats: readonly string[];
};

export type CandidateSelection = {
  candidates: readonly CatalogCandidate[];
  /** The query each beat ran, so a plan can explain why a candidate was offered. */
  queries: readonly { beat: string; query: string }[];
};

const CONTENT_VARIABLE_BONUS = 2;
const HIGH_EMPHASIS_EXTRA = 2;
const DEFAULT_PER_BEAT_LIMIT = 6;
const DEFAULT_MAX_TOTAL = 8;

/** The shortlist the planner may name. Only blocks with a declared frame and duration qualify: an uncheckable item would only produce a plan that must be thrown away. */
export function selectCatalogCandidates(input: {
  catalog: Catalog;
  recipe: VideoRecipe;
  artDirection: ArtDirection;
  aspectRatio: string;
  durationSeconds: number;
  perBeatLimit?: number;
  maxTotal?: number;
}): CandidateSelection {
  const perBeatLimit = input.perBeatLimit ?? DEFAULT_PER_BEAT_LIMIT;
  const maxTotal = input.maxTotal ?? DEFAULT_MAX_TOTAL;
  const recipeWords = input.recipe.id.replace(/_/g, " ");

  const byName = new Map<string, CatalogCandidate & { beats: string[] }>();
  const queries: { beat: string; query: string }[] = [];

  for (const beat of input.recipe.beats) {
    const query = `${beat.intent} ${recipeWords}`.trim();
    queries.push({ beat: beat.id, query });

    const emphasis = input.artDirection.beats.find((candidate) => candidate.id === beat.id)?.emphasis ?? "medium";
    const limit = perBeatLimit + (emphasis === "high" ? HIGH_EMPHASIS_EXTRA : 0);
    for (const hit of searchCatalog(input.catalog, query, { type: "block", aspectRatio: input.aspectRatio, limit })) {
      const dimensions = hit.dimensions ?? null;
      const duration = hit.duration ?? null;
      if (dimensions === null || duration === null) continue;
      if (duration > input.durationSeconds) continue;

      const details = inspectCatalogItem(input.catalog, hit.name);
      const variables = (details?.variables ?? []).map((variable) => ({
        id: variable.id,
        type: variable.type,
        role: variable.role,
        label: variable.label,
      }));
      const score = hit.score + (variables.some((variable) => variable.type === "string") ? CONTENT_VARIABLE_BONUS : 0);

      const existing = byName.get(hit.name);
      if (existing) {
        if (!existing.beats.includes(beat.id)) existing.beats.push(beat.id);
        existing.score = Math.max(existing.score, score);
        continue;
      }

      byName.set(hit.name, {
        name: hit.name,
        type: hit.type,
        title: hit.title,
        description: hit.description,
        dimensions,
        duration,
        variables,
        score,
        beats: [beat.id],
      });
    }
  }

  const candidates = [...byName.values()]
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, maxTotal);

  return { candidates, queries };
}
