import { describe, expect, it } from "vitest";
import { RENDER_INPUT_SCHEMA_VERSION, renderJobInputSnapshotSchema } from "./render-input";

const snapshot = {
  schemaVersion: RENDER_INPUT_SCHEMA_VERSION,
  briefRevisionId: "44444444-4444-4444-8444-444444444444",
  storyboardRevisionId: "55555555-5555-4555-8555-555555555555",
  styleId: "bold_pop",
  settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", language: "id", voiceOverEnabled: true, musicEnabled: true },
  variantSeed: "77777777-7777-4777-8777-777777777777",
  templateId: "product-spotlight",
  templateVersion: "1.0.0",
  stylePackVersion: "1.0.0",
  fps: 30,
};

describe("render job input snapshot", () => {
  it("accepts a complete snapshot", () => {
    expect(renderJobInputSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("rejects a snapshot missing a frozen render field", () => {
    const { variantSeed, ...withoutSeed } = snapshot;
    expect(renderJobInputSnapshotSchema.safeParse(withoutSeed).success).toBe(false);

    // Each of the four fields the render plan added is required, so a v1-era snapshot cannot be
    // read as a v2 one.
    for (const field of ["templateId", "templateVersion", "stylePackVersion", "fps"] as const) {
      const { [field]: _omitted, ...withoutField } = snapshot;
      expect(renderJobInputSnapshotSchema.safeParse(withoutField).success, `${field} is required`).toBe(false);
    }
  });

  it("rejects a snapshot carrying an unknown key", () => {
    expect(renderJobInputSnapshotSchema.safeParse({ ...snapshot, unexpectedKey: "x" }).success).toBe(false);
  });
});
