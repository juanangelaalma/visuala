import { describe, expect, it } from "vitest";
import { MAX_SCENE_COPY_CHARS, MAX_SCENE_TITLE_CHARS, findStoryboardProblems, storyboardSchema, storyboardTotalDurationSeconds } from "./storyboard";

const settings = { durationSeconds: 10 as const, aspectRatio: "9:16" as const, resolution: "1080p" as const, language: "id", voiceOverEnabled: true, musicEnabled: true };
const assetId = "22222222-2222-4222-8222-222222222222";

const scene = (overrides: Partial<{ order: number; startSeconds: number; endSeconds: number; voiceOver: string | null; caption: string | null }> = {}) => ({
  order: 1,
  startSeconds: 0,
  endSeconds: 5,
  visual: "Produk di atas meja kayu, cahaya pagi",
  onScreenTitle: "Kopi Susu Gula Aren",
  onScreenCopy: "Manisnya pas, harganya ramah",
  voiceOver: "Coba kopi susu gula aren kami",
  caption: "Coba kopi susu gula aren kami",
  assetIds: [assetId],
  audioCue: "musik lembut",
  transition: "fade" as const,
  ...overrides,
});

const scenes = [scene(), scene({ order: 2, startSeconds: 5, endSeconds: 10, voiceOver: "Pesan sekarang", caption: "Pesan sekarang" })];

describe("storyboard", () => {
  it("parses two contiguous scenes that fill ten seconds", () => {
    expect(storyboardSchema.safeParse({ scenes }).success).toBe(true);
    expect(storyboardTotalDurationSeconds(scenes)).toBe(10);
    expect(findStoryboardProblems(scenes, settings)).toEqual([]);
  });

  it("rejects an unknown scene key and an overlong on-screen title or copy", () => {
    expect(storyboardSchema.safeParse({ scenes: [{ ...scene(), watermark: true }] }).success).toBe(false);
    expect(storyboardSchema.safeParse({ scenes: [scene()] }).success).toBe(true);
    expect(storyboardSchema.safeParse({ scenes: [{ ...scene(), onScreenCopy: "x".repeat(MAX_SCENE_COPY_CHARS + 1) }] }).success).toBe(false);
    expect(storyboardSchema.safeParse({ scenes: [{ ...scene(), onScreenTitle: "x".repeat(MAX_SCENE_TITLE_CHARS + 1) }] }).success).toBe(false);
  });

  it("reports a timeline that does not start at zero, a gap, or a wrong total", () => {
    expect(findStoryboardProblems([scene({ startSeconds: 1, endSeconds: 6 })], settings)).toContain("timeline_start");
    expect(findStoryboardProblems([scene(), scene({ order: 2, startSeconds: 4, endSeconds: 10 })], settings)).toContain("timeline_gap");
    expect(findStoryboardProblems([scene()], settings)).toContain("total_duration_mismatch");
  });

  it("reports a reversed scene and a broken order sequence", () => {
    expect(findStoryboardProblems([scene({ startSeconds: 5, endSeconds: 5 })], settings)).toContain("scene_duration");
    expect(findStoryboardProblems([scene({ order: 3 }), scene({ order: 3, startSeconds: 5, endSeconds: 10 })], settings)).toContain("scene_order");
  });

  it("requires voice-over and captions when voice-over is on, and forbids them when it is off", () => {
    const silent = { ...settings, voiceOverEnabled: false };
    expect(findStoryboardProblems([scene({ voiceOver: null }), scene({ order: 2, startSeconds: 5, endSeconds: 10 })], settings)).toContain("voice_over_missing");
    expect(findStoryboardProblems(scenes, silent)).toContain("voice_over_unexpected");
    expect(findStoryboardProblems([scene({ voiceOver: null, caption: null }), scene({ order: 2, startSeconds: 5, endSeconds: 10, voiceOver: null, caption: null })], silent)).toEqual([]);
  });

  it("requires every scene to reference an asset", () => {
    expect(findStoryboardProblems([{ ...scene(), assetIds: [] }, scene({ order: 2, startSeconds: 5, endSeconds: 10 })], settings)).toContain("asset_reference_missing");
  });
});
