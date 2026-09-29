import { describe, expect, it } from "vitest";
import { z } from "zod";
import { COMPOSITION_SPEC_VERSION } from "../../domain/video-engine/composition";
import { VIDEO_ENGINE_AI_SCHEMAS } from "./ai-schemas";

const validDirection = {
  mainMessage: "Diskon 20% untuk semua menu",
  visualFocus: "the product photo, full bleed",
  hierarchy: ["headline", "offer badge", "cta"],
  mood: "bold and warm",
  imageTreatment: "crop tight on the product",
  motionDirection: "short rises",
  beats: [
    { id: "hook", intent: "stop the scroll", emphasis: "high" },
    { id: "cta", intent: "ask for the order", emphasis: "high" },
  ],
};

const validSpec = {
  schemaVersion: COMPOSITION_SPEC_VERSION,
  format: { aspectRatio: "9:16", fps: 30, durationSeconds: 12 },
  style: { id: "creative-mode", version: "1" },
  scenes: [
    {
      id: "scene_1",
      durationFrames: 180,
      transition: "cut",
      modules: [{ id: "Headline", kind: "internal", content: { text: "Julumpia" } }],
    },
    {
      id: "scene_2",
      durationFrames: 180,
      modules: [{ id: "CTA", kind: "internal", content: { text: "Pesan sekarang" } }],
    },
  ],
};

describe("video engine ai schemas", () => {
  it("registers every schema under a name@version key", () => {
    const keys = Object.keys(VIDEO_ENGINE_AI_SCHEMAS);

    expect(keys).toEqual(["art_direction@v1", "composition_spec@v1"]);
    for (const key of keys) expect(key).toMatch(/^[^@\s]+@[^@\s]+$/);
  });

  it("converts every schema to JSON Schema, so the adapter can hand it to a provider", () => {
    for (const [key, schema] of Object.entries(VIDEO_ENGINE_AI_SCHEMAS)) {
      expect(() => z.toJSONSchema(schema, { unrepresentable: "throw", target: "draft-7" }), key).not.toThrow();
    }
  });

  it("round-trips a valid art direction and a valid composition spec", () => {
    expect(VIDEO_ENGINE_AI_SCHEMAS["art_direction@v1"].parse(validDirection)).toEqual(validDirection);
    expect(VIDEO_ENGINE_AI_SCHEMAS["composition_spec@v1"].parse(validSpec)).toEqual(validSpec);
  });

  it("refuses a spec whose scene has no module and whose version is unknown", () => {
    const schema = VIDEO_ENGINE_AI_SCHEMAS["composition_spec@v1"];

    expect(schema.safeParse({ ...validSpec, scenes: [{ id: "scene_1", durationFrames: 180, modules: [] }] }).success).toBe(false);
    expect(schema.safeParse({ ...validSpec, schemaVersion: "composition-spec@v2" }).success).toBe(false);
  });
});
