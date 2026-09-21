import { describe, expect, it } from "vitest";
import { VIDEO_STYLE_PRESETS, isSupportedLanguage, validateOutputSettings } from "./settings";
import type { VideoOutputSettings } from "./types";

function settings(overrides: Partial<VideoOutputSettings> = {}): VideoOutputSettings {
  return { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true, ...overrides };
}

describe("video output settings", () => {
  it("accepts every combination the render engine verified", () => {
    expect(validateOutputSettings({ durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true }))
      .toMatchObject({ durationSeconds: 10 });
  });

  it("rejects an unsupported duration, ratio, resolution, or language", () => {
    expect(() => validateOutputSettings(settings({ durationSeconds: 7 as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
    expect(() => validateOutputSettings(settings({ aspectRatio: "4:5" as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
    expect(() => validateOutputSettings(settings({ resolution: "4k" as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
    expect(() => validateOutputSettings(settings({ language: "xx" as never }))).toThrowError(expect.objectContaining({ code: "video_input_invalid" }));
  });

  it("publishes all four style presets with preview text", () => {
    expect(VIDEO_STYLE_PRESETS.map((preset) => preset.id)).toEqual(["bold_pop", "clean_product", "warm_artisan", "premium_dark"]);
    expect(VIDEO_STYLE_PRESETS.every((preset) => preset.label.length > 0 && preset.description.length > 0)).toBe(true);
  });

  it("knows which languages the TTS decision record enabled", () => {
    expect(isSupportedLanguage("id")).toBe(true);
    expect(isSupportedLanguage("en")).toBe(true);
    expect(isSupportedLanguage("fr")).toBe(false);
  });
});
