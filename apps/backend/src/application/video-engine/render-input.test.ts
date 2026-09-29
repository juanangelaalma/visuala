import { describe, expect, it } from "vitest";
import { COMPOSITION_SPEC_VERSION } from "../../domain/video-engine/composition";
import { renderInputSnapshotSchema, renderInputSnapshotFor } from "../../domain/video-engine/render-input";
import type { VideoProject } from "../../domain/video/types";

function project(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    id: "p-1",
    userId: "u-1",
    title: "Promo",
    videoType: "product_promo",
    styleId: "creative-mode",
    status: "approved",
    settings: { durationSeconds: 12, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
    revisionRenderCount: 0,
    createdAt: "c",
    updatedAt: "u",
    ...overrides,
  };
}

describe("render input snapshot", () => {
  it("freezes the frame, the rate, and the length the plan was made for", () => {
    const snapshot = renderInputSnapshotFor({ project: project(), compositionHash: "a".repeat(64), fps: 30 });

    expect(snapshot).toEqual({
      compositionHash: "a".repeat(64),
      width: 1080,
      height: 1920,
      fps: 30,
      durationSeconds: 12,
      aspectRatio: "9:16",
      resolution: "1080p",
    });
    expect(renderInputSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("keeps the frame the settings name, so a later settings change cannot move a queued render", () => {
    const square = renderInputSnapshotFor({ project: project({ settings: { ...project().settings, aspectRatio: "1:1", resolution: "720p" } }), compositionHash: "b".repeat(64), fps: 30 });

    expect(square).toMatchObject({ width: 720, height: 720 });
  });

  it("refuses a snapshot that is missing the frame or carries an extra field", () => {
    expect(renderInputSnapshotSchema.safeParse({ compositionHash: "a".repeat(64), fps: 30 }).success).toBe(false);
    expect(renderInputSnapshotSchema.safeParse({ compositionHash: "a".repeat(64), width: 1080, height: 1920, fps: 30, durationSeconds: 12, aspectRatio: "9:16", resolution: "1080p", extra: 1 }).success).toBe(false);
    expect(renderInputSnapshotSchema.safeParse({ compositionHash: "short", width: 1080, height: 1920, fps: 30, durationSeconds: 12, aspectRatio: "9:16", resolution: "1080p" }).success).toBe(false);
  });
});

describe("composition spec version", () => {
  it("is the version the schema requires", () => {
    expect(COMPOSITION_SPEC_VERSION).toBe("composition-spec@v1");
  });
});
