import { describe, expect, it } from "vitest";
import { videoRenderJobResponseSchema, videoVersionListSchema } from "./render-schema";

describe("videoRenderJobResponseSchema", () => {
  it("accepts a queued job without startedAt, finishedAt, or errorCode", () => {
    const parsed = videoRenderJobResponseSchema.safeParse({
      job: { id: "job-1", kind: "preview", status: "queued", isRevision: false, attempts: 0, queuedAt: "2026-09-22T00:00:00.000Z" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts null, which is what a project with no render returns", () => {
    expect(videoRenderJobResponseSchema.safeParse({ job: null }).success).toBe(true);
  });

  it("rejects a status the backend does not have, instead of rendering an unknown label", () => {
    const parsed = videoRenderJobResponseSchema.safeParse({
      job: { id: "job-1", kind: "preview", status: "almost", isRevision: false, attempts: 0, queuedAt: "q" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an output kind the backend does not have", () => {
    const parsed = videoRenderJobResponseSchema.safeParse({
      job: { id: "job-1", kind: "draft", status: "queued", isRevision: false, attempts: 0, queuedAt: "q" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("videoVersionListSchema", () => {
  it("accepts a null playbackUrl, which is what a version whose object is gone returns", () => {
    const parsed = videoVersionListSchema.safeParse({
      versions: [{ id: "v-1", versionNumber: 1, kind: "final", durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", createdAt: "c", playbackUrl: null }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts the signed url the backend mints for a version that still has its object", () => {
    const parsed = videoVersionListSchema.safeParse({
      versions: [{ id: "v-1", versionNumber: 2, kind: "preview", durationSeconds: 12, aspectRatio: "1:1", resolution: "720p", createdAt: "c", playbackUrl: "https://example.test/object" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a duration the project range cannot have produced", () => {
    const parsed = videoVersionListSchema.safeParse({
      versions: [{ id: "v-1", versionNumber: 1, kind: "final", durationSeconds: 0, aspectRatio: "9:16", resolution: "1080p", createdAt: "c", playbackUrl: null }],
    });
    expect(parsed.success).toBe(false);
  });
});
