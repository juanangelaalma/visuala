import { describe, expect, it } from "vitest";
import {
  PROJECT_STATUS_LABELS,
  RENDER_JOB_STATUS_LABELS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS_SECONDS,
  VIDEO_LANGUAGES,
  VIDEO_LANGUAGE_LABELS,
  VIDEO_RESOLUTIONS,
  VIDEO_STYLE_IDS,
  VIDEO_STYLE_PRESETS,
  VIDEO_TYPES,
  VIDEO_TYPE_LABELS,
  durationLabel,
  isRenderCombinationSupported,
  languageLabel,
  projectStatusLabel,
  videoTypeLabel,
} from "./settings";

describe("video labels", () => {
  it("labels every video type", () => {
    for (const videoType of VIDEO_TYPES) {
      expect(VIDEO_TYPE_LABELS[videoType]).toBeTruthy();
      expect(videoTypeLabel(videoType)).toBe(VIDEO_TYPE_LABELS[videoType]);
    }
  });

  it("labels every project status", () => {
    const statuses = ["draft", "interviewing", "awaiting_approval", "approved", "rendering", "ready", "revision_draft", "moderation_blocked", "failed", "deleted"] as const;
    expect(Object.keys(PROJECT_STATUS_LABELS).sort()).toEqual([...statuses].sort());
    for (const status of statuses) expect(projectStatusLabel(status)).toBeTruthy();
  });

  it("labels every render job status", () => {
    const statuses = ["queued", "preparing", "rendering", "uploading", "succeeded", "failed", "cancelled"] as const;
    expect(Object.keys(RENDER_JOB_STATUS_LABELS).sort()).toEqual([...statuses].sort());
  });

  it("labels every supported language and falls back to the raw value", () => {
    for (const language of VIDEO_LANGUAGES) expect(VIDEO_LANGUAGE_LABELS[language]).toBeTruthy();
    expect(languageLabel("id")).toBe("Bahasa Indonesia");
    expect(languageLabel("fr")).toBe("fr");
  });

  it("describes every style preset once with a two-colour swatch", () => {
    expect(VIDEO_STYLE_PRESETS.map((preset) => preset.id)).toEqual([...VIDEO_STYLE_IDS]);
    for (const preset of VIDEO_STYLE_PRESETS) {
      expect(preset.label).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.swatch).toHaveLength(2);
    }
  });

  it("formats a duration in seconds", () => {
    expect(durationLabel(6)).toBe("6 detik");
    expect(durationLabel(15)).toBe("15 detik");
  });
});

describe("isRenderCombinationSupported", () => {
  it("accepts every duration, ratio, and resolution offered", () => {
    for (const durationSeconds of VIDEO_DURATIONS_SECONDS) {
      for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
        for (const resolution of VIDEO_RESOLUTIONS) {
          expect(isRenderCombinationSupported({ durationSeconds, aspectRatio, resolution })).toBe(true);
        }
      }
    }
  });

  it("rejects a combination outside the allowlist", () => {
    expect(isRenderCombinationSupported({ durationSeconds: 6, aspectRatio: "4:3" as never, resolution: "720p" })).toBe(false);
    expect(isRenderCombinationSupported({ durationSeconds: 30 as never, aspectRatio: "9:16", resolution: "720p" })).toBe(false);
    expect(isRenderCombinationSupported({ durationSeconds: 6, aspectRatio: "9:16", resolution: "4k" as never })).toBe(false);
  });
});
