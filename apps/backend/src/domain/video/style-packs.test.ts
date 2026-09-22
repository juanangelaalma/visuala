import { describe, expect, it } from "vitest";
import { STYLE_PACKS } from "./style-packs";
import { VIDEO_STYLE_IDS } from "./settings";

describe("style packs", () => {
  it("covers every style id offered by the API exactly once", () => {
    expect(Object.keys(STYLE_PACKS).sort()).toEqual([...VIDEO_STYLE_IDS].sort());
  });

  it("is frozen and versioned, because a version record keeps the version it rendered with", () => {
    for (const id of VIDEO_STYLE_IDS) {
      const pack = STYLE_PACKS[id];
      expect(pack.id).toBe(id);
      expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Object.isFrozen(pack)).toBe(true);
    }
  });

  it("keeps every colour an opaque hex literal, so a frame never depends on a compositing default", () => {
    for (const pack of Object.values(STYLE_PACKS)) {
      for (const colour of Object.values(pack.palette)) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
