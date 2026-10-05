import type { RecipeAspectRatio } from "../recipes/types";
import type { InternalModuleId } from "./ids";

/** Text is copy and must trace to the brief; an asset is an id the render was given; a token is an enumerated value. */
export type ModuleSlotKind = "text" | "asset" | "token";

export type ModuleSlot = {
  name: string;
  required: boolean;
  kind: ModuleSlotKind;
  /** The planner uses this limit when selecting slot values. */
  maxLength?: number;
};

export type VideoModule = {
  id: InternalModuleId;
  supportedRatios: readonly RecipeAspectRatio[];
  slots: readonly ModuleSlot[];
};

