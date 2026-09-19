import { describe, expect, it } from "vitest";
import type { AIPricing } from "../../domain/ai-service/config";
import type { AIAttemptUsage } from "../../domain/ai-service/usage";
import { aggregateOperationUsage, calculateAttemptCost } from "./calculate-cost";

const pricing: AIPricing = {
  pricingVersion: "2026-09",
  source: "provider-price-list",
  currency: "USD",
  inputPerMillionTokens: 2,
  outputPerMillionTokens: 8,
};

const knownAttempt: AIAttemptUsage = {
  inputTokens: 250_000,
  outputTokens: 125_000,
  totalTokens: 375_000,
  cachedInputTokens: null,
  reasoningTokens: null,
  imageCount: null,
  billingUnknown: false,
};

describe("calculateAttemptCost", () => {
  it("calculates configured input and output token dimensions", () => {
    expect(calculateAttemptCost(knownAttempt, pricing)).toEqual({
      amount: 1.5,
      currency: "USD",
      pricingVersion: "2026-09",
      source: "provider-price-list",
    });
  });

  it("does not round decimal amounts before persistence", () => {
    const usage = { ...knownAttempt, inputTokens: 1, outputTokens: 1 };
    expect(calculateAttemptCost(usage, pricing)?.amount).toBeCloseTo(0.00001, 12);
  });

  it("returns no cost when pricing is absent", () => {
    expect(calculateAttemptCost(knownAttempt)).toBeNull();
  });

  it.each([
    ["input tokens", { inputTokens: null }],
    ["output tokens", { outputTokens: null }],
    ["cached input tokens", { cachedInputTokens: 1 }],
    ["reasoning tokens", { reasoningTokens: 1 }],
    ["image count", { imageCount: 1 }],
    ["billing status", { billingUnknown: true }],
  ])("returns no cost for unknown %s", (_dimension, override) => {
    expect(calculateAttemptCost({ ...knownAttempt, ...override }, pricing)).toBeNull();
  });

  it("treats zero tokens as known usage", () => {
    const usage = { ...knownAttempt, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    expect(calculateAttemptCost(usage, pricing)?.amount).toBe(0);
  });
});

describe("aggregateOperationUsage", () => {
  it("marks zero attempts as incomplete without a cost", () => {
    expect(aggregateOperationUsage([], pricing)).toEqual({
      attemptCount: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCost: null,
      costComplete: false,
    });
  });

  it("includes every attempt in aggregate usage", () => {
    const secondAttempt = {
      ...knownAttempt,
      inputTokens: 50_000,
      outputTokens: 25_000,
      totalTokens: 75_000,
    };
    expect(aggregateOperationUsage([knownAttempt, secondAttempt], pricing)).toEqual({
      attemptCount: 2,
      inputTokens: 300_000,
      outputTokens: 150_000,
      totalTokens: 450_000,
      estimatedCost: {
        amount: 1.8,
        currency: "USD",
        pricingVersion: "2026-09",
        source: "provider-price-list",
      },
      costComplete: true,
    });
  });

  it("preserves unknown aggregate token dimensions", () => {
    const unknownAttempt = { ...knownAttempt, inputTokens: null, totalTokens: null };
    expect(aggregateOperationUsage([knownAttempt, unknownAttempt], pricing)).toMatchObject({
      inputTokens: null,
      outputTokens: 250_000,
      totalTokens: null,
    });
  });

  it("marks operation cost incomplete when one attempt is unknown", () => {
    const ambiguousAttempt = { ...knownAttempt, reasoningTokens: 1 };
    expect(aggregateOperationUsage([knownAttempt, ambiguousAttempt], pricing)).toMatchObject({
      estimatedCost: null,
      costComplete: false,
    });
  });

  it("marks operation cost incomplete when pricing is absent", () => {
    expect(aggregateOperationUsage([knownAttempt])).toMatchObject({
      estimatedCost: null,
      costComplete: false,
    });
  });
});
