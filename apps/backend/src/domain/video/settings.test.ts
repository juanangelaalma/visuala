import { describe, expect, it } from "vitest";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, VIDEO_STYLE_PRESETS, frameDimensions, isSupportedLanguage, validateOutputSettings } from "./settings";
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

  it("maps every aspect and resolution to an even-pixel frame", () => {
    expect(frameDimensions({ aspectRatio: "9:16", resolution: "1080p" })).toEqual({ width: 1080, height: 1920 });
    expect(frameDimensions({ aspectRatio: "9:16", resolution: "720p" })).toEqual({ width: 720, height: 1280 });
    expect(frameDimensions({ aspectRatio: "16:9", resolution: "1080p" })).toEqual({ width: 1920, height: 1080 });
    expect(frameDimensions({ aspectRatio: "1:1", resolution: "1080p" })).toEqual({ width: 1080, height: 1080 });
    for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
      for (const resolution of VIDEO_RESOLUTIONS) {
        const { width, height } = frameDimensions({ aspectRatio, resolution });
        expect(width % 2).toBe(0);
        expect(height % 2).toBe(0);
      }
    }
  });
});
