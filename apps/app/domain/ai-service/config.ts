import type { AITask } from "./types";

export type AICapabilities = {
  text: boolean;
  vision: boolean;
  nativeStructuredOutput: boolean;
};

export type AIProfileLimits = {
  maxInputCharacters: number;
  maxOutputTokens: number;
  maxImages: number;
  maxImageBytes: number;
  maxImageWidth: number;
  maxImageHeight: number;
  maxConcurrency: number;
  attemptTimeoutMs?: number;
  totalDeadlineMs?: number;
  maxAttempts?: number;
};

export type AITaskLimits = Partial<
  Pick<
    AIProfileLimits,
    | "maxInputCharacters"
    | "maxOutputTokens"
    | "maxImages"
    | "maxImageBytes"
    | "maxImageWidth"
    | "maxImageHeight"
    | "maxConcurrency"
  >
>;

export type AIPricing = {
  pricingVersion: string;
  source: string;
  currency: string;
  inputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
};

export type ConnectionProfile = {
  id: string;
  apiFormat: string;
  baseUrl: string;
  apiKeyEnv: string;
  modelIdEnv: string;
  provider: string;
  capabilities: AICapabilities;
  limits: AIProfileLimits;
  pricing?: AIPricing;
};

export type TaskConfig = {
  task: AITask;
  profileId: string;
  limits?: AITaskLimits;
};

export type ResolvedAIConfig = {
  profileId: string;
  apiFormat: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  provider: string;
  capabilities: AICapabilities;
  limits: Required<AIProfileLimits>;
  pricing?: AIPricing;
};

export type AIImageLimits = Pick<AIProfileLimits, "maxImageBytes" | "maxImageWidth" | "maxImageHeight">;

export type AIConfigOptions = {
  profiles: readonly ConnectionProfile[];
  tasks: readonly TaskConfig[];
  registeredApiFormats: readonly string[];
  getEnvironmentValue: (name: string) => string | undefined;
  profileOverride?: string;
  allowInsecureLoopback?: boolean;
};
