import { MIN_SCENE_SECONDS, totalFrames } from "../composition";
import type { CompositionSpec } from "../composition";
import type { ValidationIssue } from "./types";

/** Overshooting the requested duration, or a scene under half a second, is a refusal rather than a trim. */
export function validateDuration(spec: CompositionSpec): ValidationIssue[] {
  const { fps, durationSeconds } = spec.format;
  const issues: ValidationIssue[] = [];

  const shortest = MIN_SCENE_SECONDS * fps;
  for (const scene of spec.scenes) {
    if (scene.durationFrames < shortest) {
      issues.push({ code: "scene_too_short", message: `Scene ${scene.id} is shorter than ${MIN_SCENE_SECONDS}s.`, sceneId: scene.id });
    }
  }

  const frames = totalFrames(spec);
  const budget = durationSeconds * fps;
  if (frames > budget) {
    issues.push({ code: "duration_exceeded", message: `The timeline is ${frames} frames, which is longer than the requested ${budget}.` });
  }

  return issues;
}
