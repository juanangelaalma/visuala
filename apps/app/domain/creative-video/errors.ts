import type { CreativeProjectState } from "./types";

export type CreativeVideoErrorCode =
  | "INVALID_PROJECT_TRANSITION"
  | "PROJECT_REVISION_CONFLICT"
  | "ANALYSIS_FAILED"
  | "ANALYSIS_INVALID_OUTPUT"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_INCOMPATIBLE";

export class CreativeVideoError extends Error {
  readonly code: CreativeVideoErrorCode;
  readonly safeMessage: string;

  constructor(code: CreativeVideoErrorCode, safeMessage: string) {
    super(safeMessage);
    this.name = "CreativeVideoError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export class InvalidProjectTransitionError extends CreativeVideoError {
  readonly from: CreativeProjectState;
  readonly to: CreativeProjectState;

  constructor(from: CreativeProjectState, to: CreativeProjectState) {
    super(
      "INVALID_PROJECT_TRANSITION",
      `Cannot transition creative project from ${from} to ${to}.`,
    );
    this.name = "InvalidProjectTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class ProjectRevisionConflictError extends CreativeVideoError {
  constructor() {
    super(
      "PROJECT_REVISION_CONFLICT",
      "This creative project changed. Refresh and try again.",
    );
    this.name = "ProjectRevisionConflictError";
  }
}

export class CreativeAnalysisError extends CreativeVideoError {
  constructor(code: "ANALYSIS_FAILED" | "ANALYSIS_INVALID_OUTPUT") {
    super(code, code === "ANALYSIS_INVALID_OUTPUT"
      ? "We could not analyze this creative brief. Please try again."
      : "Creative brief analysis is temporarily unavailable. Please try again.");
    this.name = "CreativeAnalysisError";
  }
}

export class PluginNotFoundError extends CreativeVideoError {
  constructor(kind: "category" | "style", id: string, version: string) {
    super(
      "PLUGIN_NOT_FOUND",
      `Creative video ${kind} plugin ${id}@${version} is not available.`,
    );
    this.name = "PluginNotFoundError";
  }
}

export class IncompatiblePluginError extends CreativeVideoError {
  constructor(categoryId: string, styleId: string) {
    super(
      "PLUGIN_INCOMPATIBLE",
      `Creative video category ${categoryId} is not compatible with style ${styleId}.`,
    );
    this.name = "IncompatiblePluginError";
  }
}
