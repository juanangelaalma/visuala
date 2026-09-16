import { describe, expect, it } from "vitest";
import { InvalidProjectTransitionError } from "./errors";
import {
  assertProjectRetryTransition,
  assertProjectTransition,
} from "./state-machine";

describe("assertProjectTransition", () => {
  it.each([
    ["draft", "analyzing"],
    ["analyzing", "needs_input"],
    ["analyzing", "concepts_ready"],
    ["concepts_ready", "building_preview"],
    ["building_preview", "preview_ready"],
    ["preview_ready", "rendering"],
    ["rendering", "completed"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(() => assertProjectTransition(from, to)).not.toThrow();
  });

  it("rejects skipping directly from draft to completed", () => {
    expect(() => assertProjectTransition("draft", "completed")).toThrow(
      InvalidProjectTransitionError,
    );
  });

  it.each([
    ["analyzing", "failed"],
    ["building_preview", "failed"],
    ["rendering", "failed"],
  ] as const)("allows active processing state %s -> %s", (from, to) => {
    expect(() => assertProjectTransition(from, to)).not.toThrow();
  });

  it.each([
    ["draft", "failed"],
    ["needs_input", "failed"],
    ["concepts_ready", "failed"],
    ["preview_ready", "failed"],
    ["completed", "failed"],
    ["failed", "analyzing"],
    ["failed", "building_preview"],
    ["failed", "rendering"],
    ["failed", "completed"],
  ] as const)("rejects inactive failure or invalid retry %s -> %s", (from, to) => {
    expect(() => assertProjectTransition(from, to)).toThrow(
      InvalidProjectTransitionError,
    );
  });
});

describe("assertProjectRetryTransition", () => {
  it.each([
    ["analysis", "analyzing"],
    ["planning", "building_preview"],
    ["compilation", "building_preview"],
    ["rendering", "rendering"],
  ] as const)("allows %s Category retry to %s", (failedStage, to) => {
    expect(() => assertProjectRetryTransition(failedStage, to)).not.toThrow();
  });

  it.each([
    ["analysis", "building_preview"],
    ["planning", "analyzing"],
    ["compilation", "rendering"],
    ["rendering", "building_preview"],
  ] as const)("rejects %s Category retry to %s", (failedStage, to) => {
    expect(() => assertProjectRetryTransition(failedStage, to)).toThrow(
      InvalidProjectTransitionError,
    );
  });
});
