import { describe, expect, it } from "vitest";
import { assertVideoProjectTransition, canMutateProjectAssets, canTransitionVideoProjectStatus } from "./state-machine";

describe("video project state machine", () => {
  it("walks the PRD flow", () => {
    expect(canTransitionVideoProjectStatus("draft", "interviewing")).toBe(true);
    expect(canTransitionVideoProjectStatus("interviewing", "awaiting_approval")).toBe(true);
    expect(canTransitionVideoProjectStatus("awaiting_approval", "approved")).toBe(true);
    expect(canTransitionVideoProjectStatus("approved", "rendering")).toBe(true);
    expect(canTransitionVideoProjectStatus("rendering", "ready")).toBe(true);
    expect(canTransitionVideoProjectStatus("ready", "revision_draft")).toBe(true);
    expect(canTransitionVideoProjectStatus("revision_draft", "awaiting_approval")).toBe(true);
  });

  it("refuses to render straight out of a revision draft", () => {
    expect(canTransitionVideoProjectStatus("revision_draft", "rendering")).toBe(false);
  });

  it("lets a cancelled queued job return the project to approved", () => {
    expect(canTransitionVideoProjectStatus("rendering", "approved")).toBe(true);
  });

  it("allows moderation, failure, and deletion from every active state", () => {
    for (const status of ["draft", "interviewing", "awaiting_approval", "approved", "rendering", "ready", "revision_draft"] as const) {
      expect(canTransitionVideoProjectStatus(status, "deleted")).toBe(true);
      expect(canTransitionVideoProjectStatus(status, "failed")).toBe(true);
      expect(canTransitionVideoProjectStatus(status, "moderation_blocked")).toBe(true);
    }
  });

  it("treats a repeated target state as idempotent and anything else as a conflict", () => {
    expect(() => assertVideoProjectTransition("approved", "approved")).not.toThrow();
    expect(() => assertVideoProjectTransition("ready", "interviewing")).toThrowError(
      expect.objectContaining({ code: "video_state_conflict" }),
    );
  });

  it("only mutates assets in editable states", () => {
    expect((["draft", "interviewing", "awaiting_approval", "revision_draft"] as const).every(canMutateProjectAssets)).toBe(true);
    expect((["approved", "rendering", "ready", "failed", "deleted"] as const).some(canMutateProjectAssets)).toBe(false);
  });
});
