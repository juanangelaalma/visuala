import { describe, expect, it } from "vitest";
import { z } from "zod";
import { COMPOSITION_SPEC_VERSION, compositionSpecFromWire, compositionSpecWireSchema, compositionSpecSchema, sceneTimeline } from "../../domain/video-engine/composition";
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
      transition: "slide",
      motion: "staged_reveal",
      modules: [{ id: "Headline", kind: "internal", content: [{ key: "text", value: "Julumpia" }] }],
    },
    {
      id: "scene_2",
      durationFrames: 180,
      transition: "zoom",
      motion: "staged_reveal",
      modules: [{ id: "CTA", kind: "internal", content: [{ key: "text", value: "Pesan sekarang" }] }],
    },
  ],
};

describe("video engine ai schemas", () => {
  it("registers every schema under a name@version key", () => {
    const keys = Object.keys(VIDEO_ENGINE_AI_SCHEMAS);

    expect(keys).toEqual(["art_direction@v1", "composition_spec@v1"]);
    for (const key of keys) expect(key).toMatch(/^[^@\s]+@[^@\s]+$/);
  });


  it("round-trips a valid art direction and a valid composition spec", () => {
    expect(VIDEO_ENGINE_AI_SCHEMAS["art_direction@v1"].parse(validDirection)).toEqual(validDirection);
    expect(VIDEO_ENGINE_AI_SCHEMAS["composition_spec@v1"].parse(validSpec)).toEqual(validSpec);
  });

  it("refuses a spec whose scene has no module and whose version is unknown", () => {
    const schema = VIDEO_ENGINE_AI_SCHEMAS["composition_spec@v1"];

    expect(schema.safeParse({ ...validSpec, scenes: [{ ...validSpec.scenes[0]!, modules: [] }] }).success).toBe(false);
    expect(schema.safeParse({ ...validSpec, schemaVersion: "composition-spec@v2" }).success).toBe(false);
  });

  it("requires bounded executable motion and transition fields on provider output", () => {
    const scene = validSpec.scenes[0]!;
    for (const replacement of [
      { ...scene, transition: "dissolve" },
      { ...scene, motion: "float_forever" },
      { ...scene, transition: undefined },
      { ...scene, motion: undefined },
    ]) {
      expect(compositionSpecWireSchema.safeParse({ ...validSpec, scenes: [replacement] }).success).toBe(false);
    }
  });

  it("reconstructs executable fields while accepting stored specs without them", () => {
    const spec = compositionSpecFromWire(compositionSpecWireSchema.parse(validSpec));
    expect(sceneTimeline(spec).map(({ transition, motion }) => ({ transition, motion }))).toEqual([
      { transition: "slide", motion: "staged_reveal" },
      { transition: "zoom", motion: "staged_reveal" },
    ]);
    const legacy = compositionSpecSchema.parse({
      ...spec, scenes: spec.scenes.map(({ transition: _transition, motion: _motion, ...scene }) => scene),
    });
    expect(sceneTimeline(legacy).map(({ transition, motion }) => ({ transition, motion }))).toEqual([
      { transition: "slide", motion: "staged_reveal" },
      { transition: "slide", motion: "staged_reveal" },
    ]);
  });

  it("keeps every schema inside what strict structured output allows", () => {
    for (const [key, schema] of Object.entries(VIDEO_ENGINE_AI_SCHEMAS)) {
      const json = z.toJSONSchema(schema, { unrepresentable: "throw", target: "draft-7" });
      expect(strictStructuredProblems(json), key).toEqual([]);
    }
  });
});

/**
 * Strict structured output refuses a dynamic-key object (`propertyNames`) and any property missing from
 * `required`. The planner schema broke both once and the provider answered 400 before any model call.
 */
function strictStructuredProblems(node: unknown, path = "(root)"): string[] {
  if (Array.isArray(node)) return node.flatMap((child, index) => strictStructuredProblems(child, `${path}[${index}]`));
  if (!node || typeof node !== "object") return [];
  const object = node as Record<string, unknown>;
  const problems: string[] = [];
  if ("propertyNames" in object) problems.push(`${path}: propertyNames is not permitted`);
  const properties = object.properties as Record<string, unknown> | undefined;
  if (properties) {
    if (object.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
    const required = Array.isArray(object.required) ? (object.required as string[]) : [];
    for (const name of Object.keys(properties)) if (!required.includes(name)) problems.push(`${path}.${name}: not in required`);
  }
  for (const [name, child] of Object.entries(object)) problems.push(...strictStructuredProblems(child, `${path}.${name}`));
  return problems;
}
