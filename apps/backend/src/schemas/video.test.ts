import { describe, expect, it } from "vitest";
import { createVideoProjectBodySchema } from "./video";

const body = {
  title: "Promo Kopi",
  videoType: "product_promo",
  styleId: "bold_pop",
  settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true },
};

describe("createVideoProjectBodySchema", () => {
  it("accepts the documented body", () => {
    expect(createVideoProjectBodySchema.safeParse(body).success).toBe(true);
  });

  it("rejects a client-supplied owner, status, or id instead of ignoring it", () => {
    for (const extra of [{ user_id: "someone" }, { userId: "someone" }, { status: "approved" }, { id: "11111111-1111-4111-8111-111111111111" }, { revision_render_count: 0 }]) {
      expect(createVideoProjectBodySchema.safeParse({ ...body, ...extra }).success).toBe(false);
    }
  });

  it("rejects extra keys inside settings too", () => {
    expect(createVideoProjectBodySchema.safeParse({ ...body, settings: { ...body.settings, watermark: false } }).success).toBe(false);
  });

  it("rejects a settings payload that omits a required toggle", () => {
    const { musicEnabled, ...incomplete } = body.settings;
    expect(createVideoProjectBodySchema.safeParse({ ...body, settings: incomplete }).success).toBe(false);
  });
});
