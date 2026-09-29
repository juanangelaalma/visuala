import type { BriefField } from "../../video/brief";
import type { VideoType } from "../../video/types";
import type { InternalModuleId } from "../modules/ids";

/** A recipe is a video type's requirement set, never a fixed layout. The id is the project's video type. */
export type RecipeId = VideoType;

/** One message beat. The candidate selector searches the catalog per beat, not once for the whole video. */
export type RecipeBeat = { id: string; intent: string };

export type RecipeAspectRatio = "9:16" | "1:1" | "16:9";

export type VideoRecipe = {
  id: RecipeId;
  version: string;
  purpose: string;
  /** Brief fields this recipe cannot be written without; a subset of what the interview tracks. */
  required: readonly BriefField[];
  beats: readonly RecipeBeat[];
  recommendedModules: readonly InternalModuleId[];
  defaultDurationSeconds: number;
  defaultAspectRatio: RecipeAspectRatio;
  /** Hard rules the planner is told to respect; the fact validator enforces the enforceable ones. */
  constraints: readonly string[];
};
