import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VIDEO_AI_SCHEMAS } from "./ai-schemas";

describe("video ai schemas", () => {
  it("registers every schema under a name@version key", () => {
    const keys = Object.keys(VIDEO_AI_SCHEMAS);

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^[^@\s]+@[^@\s]+$/);
  });

  it("converts every schema to JSON Schema, so the adapter can hand it to a provider", () => {
    for (const [key, schema] of Object.entries(VIDEO_AI_SCHEMAS)) {
      expect(() => z.toJSONSchema(schema, { unrepresentable: "throw", target: "draft-7" }), key).not.toThrow();
    }
  });
});
