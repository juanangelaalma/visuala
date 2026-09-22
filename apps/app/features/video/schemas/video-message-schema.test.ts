import { describe, expect, it } from "vitest";
import { videoMessageSchema } from "./video-message-schema";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

describe("videoMessageSchema", () => {
  it("accepts a message and trims it", () => {
    expect(videoMessageSchema.parse({ projectId: PROJECT_ID, content: "  buat video jualan  " })).toEqual({
      projectId: PROJECT_ID,
      content: "buat video jualan",
    });
  });

  it("rejects a whitespace-only message with an Indonesian hint", () => {
    const result = videoMessageSchema.safeParse({ projectId: PROJECT_ID, content: "   " });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Tulis pesan dulu.");
  });

  it("rejects a message above the backend limit", () => {
    expect(videoMessageSchema.safeParse({ projectId: PROJECT_ID, content: "x".repeat(4001) }).success).toBe(false);
  });

  it("rejects a project id that is not a uuid", () => {
    expect(videoMessageSchema.safeParse({ projectId: "not-a-uuid", content: "halo" }).success).toBe(false);
  });

  it("rejects a client-owned field", () => {
    expect(videoMessageSchema.safeParse({ projectId: PROJECT_ID, content: "halo", role: "assistant" }).success).toBe(false);
  });
});
