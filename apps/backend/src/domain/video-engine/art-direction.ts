import { z } from "zod";
import type { VideoRecipe } from "./recipes/types";

/** What the Art Director returns: direction in words, never in code and never a commercial claim. */
export const artDirectionSchema = z
  .object({
    mainMessage: z.string().trim().min(1).max(120),
    visualFocus: z.string().trim().min(1).max(160),
    hierarchy: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
    mood: z.string().trim().min(1).max(80),
    imageTreatment: z.string().trim().min(1).max(160),
    motionDirection: z.string().trim().min(1).max(160),
    beats: z
      .array(
        z
          .object({
            id: z.string().trim().regex(/^[a-z0-9_]+$/),
            intent: z.string().trim().min(1).max(120),
            emphasis: z.enum(["high", "medium", "low"]),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

export type ArtDirection = z.infer<typeof artDirectionSchema>;

/** The recipe owns the beats, so every beat the director describes must be one of the recipe's, exactly once. */
export function artDirectionBeatIssues(artDirection: ArtDirection, recipe: VideoRecipe): string[] {
  const expected = recipe.beats.map((beat) => beat.id);
  const returned = artDirection.beats.map((beat) => beat.id);
  const issues: string[] = [];

  const unknown = returned.filter((id) => !expected.includes(id));
  if (unknown.length > 0) issues.push(`unknown beat ids: ${unknown.join(", ")}`);

  const missing = expected.filter((id) => !returned.includes(id));
  if (missing.length > 0) issues.push(`missing beat ids: ${missing.join(", ")}`);

  const duplicated = returned.filter((id, index) => returned.indexOf(id) !== index);
  if (duplicated.length > 0) issues.push(`duplicated beat ids: ${duplicated.join(", ")}`);

  return issues;
}
