import type { EstimatedCost } from "./types";

export type AIAttemptUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  imageCount: number | null;
  billingUnknown: boolean;
};

export type AIOperationUsage = {
  attemptCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCost: EstimatedCost | null;
  costComplete: boolean;
};
