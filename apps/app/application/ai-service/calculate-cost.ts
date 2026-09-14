import type { AIPricing } from "../../domain/ai-service/config";
import type { AIAttemptUsage, AIOperationUsage } from "../../domain/ai-service/usage";
import type { EstimatedCost } from "../../domain/ai-service/types";

const TOKENS_PER_MILLION = 1_000_000;

export function calculateAttemptCost(
  usage: AIAttemptUsage,
  pricing?: AIPricing,
): EstimatedCost | null {
  if (!pricing || !hasCompleteConfiguredUsage(usage, pricing)) return null;
  const amount = calculateTokenCost(usage, pricing);
  return {
    amount,
    currency: pricing.currency,
    pricingVersion: pricing.pricingVersion,
    source: pricing.source,
  };
}

export function aggregateOperationUsage(
  attempts: readonly AIAttemptUsage[],
  pricing?: AIPricing,
): AIOperationUsage {
  if (attempts.length === 0) return emptyOperationUsage();
  const costs = attempts.map((attempt) => calculateAttemptCost(attempt, pricing));
  const costComplete = costs.every((cost) => cost !== null) && pricing !== undefined;
  return {
    attemptCount: attempts.length,
    inputTokens: sumKnownDimension(attempts, "inputTokens"),
    outputTokens: sumKnownDimension(attempts, "outputTokens"),
    totalTokens: sumKnownDimension(attempts, "totalTokens"),
    estimatedCost: costComplete ? aggregateCosts(costs, pricing) : null,
    costComplete,
  };
}

function emptyOperationUsage(): AIOperationUsage {
  return {
    attemptCount: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    estimatedCost: null,
    costComplete: false,
  };
}

function hasCompleteConfiguredUsage(usage: AIAttemptUsage, pricing: AIPricing): boolean {
  if (usage.billingUnknown || hasUnknownExtraDimension(usage)) return false;
  if (pricing.inputPerMillionTokens !== undefined && usage.inputTokens === null) return false;
  if (pricing.outputPerMillionTokens !== undefined && usage.outputTokens === null) return false;
  return true;
}

function hasUnknownExtraDimension(usage: AIAttemptUsage): boolean {
  return usage.cachedInputTokens !== null || usage.reasoningTokens !== null || usage.imageCount !== null;
}

function calculateTokenCost(usage: AIAttemptUsage, pricing: AIPricing): number {
  const inputCost = ((usage.inputTokens ?? 0) * (pricing.inputPerMillionTokens ?? 0)) / TOKENS_PER_MILLION;
  const outputCost = ((usage.outputTokens ?? 0) * (pricing.outputPerMillionTokens ?? 0)) / TOKENS_PER_MILLION;
  return inputCost + outputCost;
}

function sumKnownDimension(
  attempts: readonly AIAttemptUsage[],
  dimension: "inputTokens" | "outputTokens" | "totalTokens",
): number | null {
  if (attempts.some((attempt) => attempt[dimension] === null)) return null;
  return attempts.reduce((sum, attempt) => sum + (attempt[dimension] ?? 0), 0);
}

function aggregateCosts(
  costs: readonly (EstimatedCost | null)[],
  pricing: AIPricing,
): EstimatedCost {
  return {
    amount: costs.reduce((sum, cost) => sum + (cost?.amount ?? 0), 0),
    currency: pricing.currency,
    pricingVersion: pricing.pricingVersion,
    source: pricing.source,
  };
}
