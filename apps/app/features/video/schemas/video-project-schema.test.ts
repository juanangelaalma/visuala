import { describe, expect, it } from "vitest";
import { createVideoProjectSchema, isSupportedAssetMimeType, videoProjectFormSchema } from "./video-project-schema";

function formValues(overrides: Record<string, unknown> = {}) {
  return {
    title: "Es Kopi Gula Aren",
    videoType: "product_promo",
    styleId: "bold_pop",
    durationSeconds: "10",
    aspectRatio: "9:16",
    resolution: "1080p",
    language: "id",
    voiceOverEnabled: "true",
    musicEnabled: "false",
    ...overrides,
  };
}

describe("createVideoProjectSchema", () => {
  it("accepts the exact body the backend expects", () => {
    const parsed = createVideoProjectSchema.parse({
      title: "Es Kopi Gula Aren",
      videoType: "product_promo",
      styleId: "bold_pop",
      settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
    });
    expect(parsed.settings.durationSeconds).toBe(10);
  });

  it("rejects a server-owned field", () => {
    expect(
      createVideoProjectSchema.safeParse({
        id: "project-1",
        title: "Es Kopi",
        videoType: "product_promo",
        styleId: "bold_pop",
        settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
      }).success,
    ).toBe(false);
  });

  it("rejects an unsupported duration", () => {
    const result = createVideoProjectSchema.safeParse({
      title: "Es Kopi",
      videoType: "product_promo",
      styleId: "bold_pop",
      settings: { durationSeconds: 30, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
    });
    expect(result.success).toBe(false);
  });
});

describe("videoProjectFormSchema", () => {
  it("coerces the flat form values the browser submits", () => {
    const parsed = videoProjectFormSchema.parse(formValues());
    expect(parsed).toEqual({
      title: "Es Kopi Gula Aren",
      videoType: "product_promo",
      styleId: "bold_pop",
      durationSeconds: 10,
      aspectRatio: "9:16",
      resolution: "1080p",
      language: "id",
      voiceOverEnabled: true,
      musicEnabled: false,
    });
  });

  it("reads the string \"false\" as false", () => {
    expect(videoProjectFormSchema.parse(formValues({ voiceOverEnabled: "false" })).voiceOverEnabled).toBe(false);
  });

  it("accepts browser checkbox booleans with the same parsed output", () => {
    const parsed = videoProjectFormSchema.parse(formValues({ voiceOverEnabled: true, musicEnabled: false }));
    expect(parsed.voiceOverEnabled).toBe(true);
    expect(parsed.musicEnabled).toBe(false);
  });

  it("rejects a checkbox value that is neither true nor false", () => {
    expect(videoProjectFormSchema.safeParse(formValues({ musicEnabled: "on" })).success).toBe(false);
  });

  it("rejects an empty title with an Indonesian message", () => {
    const result = videoProjectFormSchema.safeParse(formValues({ title: "  " }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Judul video wajib diisi.");
  });

  it("rejects an unsupported language", () => {
    expect(videoProjectFormSchema.safeParse(formValues({ language: "fr" })).success).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(videoProjectFormSchema.safeParse(formValues({ userId: "user-1" })).success).toBe(false);
  });
});

describe("isSupportedAssetMimeType", () => {
  it("accepts the three supported image types and rejects the rest", () => {
    expect(isSupportedAssetMimeType("image/jpeg")).toBe(true);
    expect(isSupportedAssetMimeType("image/png")).toBe(true);
    expect(isSupportedAssetMimeType("image/webp")).toBe(true);
    expect(isSupportedAssetMimeType("image/gif")).toBe(false);
  });
});
