import { InvalidProjectTransitionError } from "./errors";
import type {
  CreativeFailedStage,
  CreativeProcessingState,
  CreativeProjectState,
} from "./types";

const allowedTransitions: Readonly<
  Record<CreativeProjectState, readonly CreativeProjectState[]>
> = {
  draft: ["analyzing"],
  analyzing: ["needs_input", "concepts_ready", "failed"],
  needs_input: ["analyzing"],
  concepts_ready: ["building_preview"],
  building_preview: ["preview_ready", "failed"],
  preview_ready: ["building_preview", "rendering"],
  rendering: ["completed", "failed"],
  completed: [],
  failed: [],
};

const retryStateByFailedStage: Readonly<
  Record<CreativeFailedStage, CreativeProcessingState>
> = {
  analysis: "analyzing",
  planning: "building_preview",
  compilation: "building_preview",
  rendering: "rendering",
};

export function assertProjectTransition(
  from: CreativeProjectState,
  to: CreativeProjectState,
): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new InvalidProjectTransitionError(from, to);
  }
}

export function assertProjectRetryTransition(
  failedStage: CreativeFailedStage,
  to: CreativeProcessingState,
): void {
  if (retryStateByFailedStage[failedStage] !== to) {
    throw new InvalidProjectTransitionError("failed", to);
  }
}
