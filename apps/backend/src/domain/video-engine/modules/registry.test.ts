import { describe, expect, it } from "vitest";
import { INTERNAL_MODULE_IDS, INTERNAL_MODULES, internalModuleById } from "./registry";

describe("internal module registry", () => {
  it("covers every allowed module id with metadata", () => {
    expect(INTERNAL_MODULES.map((module) => module.id).sort()).toEqual([...INTERNAL_MODULE_IDS].sort());
    for (const module of INTERNAL_MODULES) {
      expect(module.supportedRatios).toEqual(["9:16", "1:1", "16:9"]);
    }
  });

  it("provides slot boundaries to the planner and validators", () => {
    expect(internalModuleById("Headline").slots).toEqual([
      { name: "text", required: true, kind: "text", maxLength: 40 },
    ]);
    expect(internalModuleById("Price").slots).toEqual([
      { name: "value", required: true, kind: "text", maxLength: 16 },
      { name: "label", required: false, kind: "text", maxLength: 24 },
    ]);
    expect(internalModuleById("ProductHero").slots).toEqual([
      { name: "assetId", required: true, kind: "asset" },
    ]);
    expect(internalModuleById("BackgroundTexture").slots).toEqual([
      { name: "tone", required: false, kind: "token", maxLength: 16 },
    ]);
  });

  it("throws for an unknown module id", () => {
    expect(() => internalModuleById("Nope" as never)).toThrow(/No internal module/);
  });
});
