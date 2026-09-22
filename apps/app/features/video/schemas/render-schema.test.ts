import { describe, expect, it } from "vitest";
import { videoRenderJobListSchema, videoVersionListSchema } from "./render-schema";

describe("videoRenderJobListSchema", () => {
  it("accepts a queued job without startedAt, finishedAt, or errorCode", () => {
    const parsed = videoRenderJobListSchema.safeParse({
      jobs: [{ id: "job-1", status: "queued", isRevision: false, attempts: 0, queuedAt: "2026-09-22T00:00:00.000Z", createdAt: "2026-09-22T00:00:00.000Z" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty list, which is what a project with no render returns", () => {
    expect(videoRenderJobListSchema.safeParse({ jobs: [] }).success).toBe(true);
  });

  it("rejects a status the backend does not have, instead of rendering an unknown label", () => {
    const parsed = videoRenderJobListSchema.safeParse({
      jobs: [{ id: "job-1", status: "almost", isRevision: false, attempts: 0, queuedAt: "q", createdAt: "c" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("videoVersionListSchema", () => {
  it("accepts a null playbackUrl, which is what a version whose object is gone returns", () => {
    const parsed = videoVersionListSchema.safeParse({
      versions: [{ id: "v-1", versionNumber: 1, durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", createdAt: "c", playbackUrl: null }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts the signed url the backend mints for a version that still has its object", () => {
    const parsed = videoVersionListSchema.safeParse({
      versions: [{ id: "v-1", versionNumber: 2, durationSeconds: 6, aspectRatio: "1:1", resolution: "720p", createdAt: "c", playbackUrl: "https://example.test/object" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a duration the API cannot have produced", () => {
    const parsed = videoVersionListSchema.safeParse({
      versions: [{ id: "v-1", versionNumber: 1, durationSeconds: 7, aspectRatio: "9:16", resolution: "1080p", createdAt: "c", playbackUrl: null }],
    });
    expect(parsed.success).toBe(false);
  });
});
