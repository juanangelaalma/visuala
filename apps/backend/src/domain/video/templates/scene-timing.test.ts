import { describe, expect, it } from "vitest";
import { sceneTiming } from "./scene-timing";

describe("sceneTiming", () => {
  it.each([0.5, 1, 1.49])("keeps short scene %s static", (duration) => {
    expect(sceneTiming(duration, 0.7)).toEqual({ enter: 0, exit: 0, hold: duration, stagger: 0 });
  });
  it.each([1.5, 2, 4, 6, 10, 15])("preserves reading time for %s", (duration) => {
    const timing = sceneTiming(duration, 0.7);
    expect(timing.enter + timing.hold + timing.exit).toBeCloseTo(duration);
    expect(timing.hold).toBeGreaterThanOrEqual(duration * 0.7 - 0.000001);
    expect(timing.stagger * 4).toBeLessThanOrEqual(timing.enter);
  });
});
