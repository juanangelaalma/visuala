import { describe, expect, it } from "vitest";
import type { AIUsage } from "./types";

describe("AI service usage", () => {
  it("preserves unknown provider usage as null", () => {
    const usage: AIUsage = {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };

    expect(usage.totalTokens).toBeNull();
  });
});
