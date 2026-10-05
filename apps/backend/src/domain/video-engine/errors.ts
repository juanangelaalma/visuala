import type { ValidationCode } from "./validators/types";

export type CompositionErrorCode =
  | "composition_asset_missing"
  | "composition_asset_mutated"
  | "composition_block_mutated"
  | "composition_font_missing";

export class CompositionError extends Error {
  constructor(readonly code: CompositionErrorCode, message: string) {
    super(message);
    this.name = "CompositionError";
  }
}

export type PlanningErrorCode =
  | "art_direction_beat_mismatch"
  | "art_direction_untraceable"
  | "composition_plan_invalid";

export class PlanningError extends Error {
  constructor(readonly code: PlanningErrorCode, message: string, readonly issueCodes: readonly ValidationCode[] = []) {
    super(message);
    this.name = "PlanningError";
  }
}

export type CompositionGenerationErrorCode = "composition_html_invalid" | "composition_visual_check_failed";

export class CompositionGenerationError extends Error {
  constructor(
    readonly code: CompositionGenerationErrorCode,
    message: string,
    readonly issueCodes: readonly string[],
    readonly attempts: number,
  ) {
    super(message);
    this.name = "CompositionGenerationError";
  }
}

/** The closed set of codes a failed render may be recorded with. */
export const RENDER_FAILURE_CODES = [
  "render_engine_failed",
  "render_output_invalid",
  "render_output_too_large",
  "render_timeout",
  "render_stale",
  "composition_input_missing",
] as const;

export type RenderFailureCode = (typeof RENDER_FAILURE_CODES)[number];

export function isRenderFailureCode(value: string): value is RenderFailureCode {
  return (RENDER_FAILURE_CODES as readonly string[]).includes(value);
}

export class RenderFailure extends Error {
  constructor(readonly code: RenderFailureCode, message: string) {
    super(message);
    this.name = "RenderFailure";
  }
}
