import "server-only";

import { z } from "zod";
import type { AIConfigOptions, ConnectionProfile, TaskConfig } from "../../domain/ai-service/config";
import { AIError } from "../../domain/ai-service/errors";

export const GOOGLE_GENERATE_CONTENT_FORMAT = "google-generate-content";

const environmentSchema = z.object({
  AI_PROFILES_JSON: z.string().min(1),
  AI_TASKS_JSON: z.string().min(1),
  AI_MAX_CONCURRENCY: z.coerce.number().int().positive(),
});
const positiveInteger = z.number().int().positive();
const nonnegativeInteger = z.number().int().nonnegative();
const capabilitiesSchema = z.object({
  text: z.boolean(),
  vision: z.boolean(),
  nativeStructuredOutput: z.boolean(),
});
const profileLimitsSchema = z.object({
  maxInputCharacters: positiveInteger,
  maxOutputTokens: positiveInteger,
  maxImages: nonnegativeInteger,
  maxImageBytes: positiveInteger,
  maxImageWidth: positiveInteger,
  maxImageHeight: positiveInteger,
  maxConcurrency: positiveInteger,
  attemptTimeoutMs: positiveInteger.optional(),
  totalDeadlineMs: positiveInteger.optional(),
  maxAttempts: positiveInteger.optional(),
});
const pricingSchema = z.object({
  pricingVersion: z.string().trim().min(1),
  source: z.string().trim().min(1),
  currency: z.string().trim().min(1),
  inputPerMillionTokens: z.number().nonnegative().optional(),
  outputPerMillionTokens: z.number().nonnegative().optional(),
});
const profileSchema = z.object({
  id: z.string().trim().min(1),
  apiFormat: z.string().trim().min(1),
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().trim().min(1),
  modelIdEnv: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  capabilities: capabilitiesSchema,
  limits: profileLimitsSchema,
  pricing: pricingSchema.optional(),
});
const taskSchema = z.object({
  task: z.enum(["connection_test", "interviewer", "planner", "product_analysis"]),
  profileId: z.string().trim().min(1),
  limits: z.object({
    maxInputCharacters: positiveInteger.optional(),
    maxOutputTokens: positiveInteger.optional(),
    maxImages: nonnegativeInteger.optional(),
    maxImageBytes: positiveInteger.optional(),
    maxImageWidth: positiveInteger.optional(),
    maxImageHeight: positiveInteger.optional(),
    maxConcurrency: positiveInteger.optional(),
  }).optional(),
});

export type AIServiceEnvironment = Readonly<Record<string, string | undefined>>;

export type AIServiceConfiguration = {
  profiles: readonly ConnectionProfile[];
  tasks: readonly TaskConfig[];
  maximumConcurrency: number;
  getEnvironmentValue: (name: string) => string | undefined;
};

export function readAIServiceConfiguration(environment: AIServiceEnvironment = process.env): AIServiceConfiguration {
  try {
    const parsed = environmentSchema.parse(environment);
    return {
      profiles: z.array(profileSchema).parse(parseJson(parsed.AI_PROFILES_JSON)) as ConnectionProfile[],
      tasks: z.array(taskSchema).parse(parseJson(parsed.AI_TASKS_JSON)) as TaskConfig[],
      maximumConcurrency: parsed.AI_MAX_CONCURRENCY,
      getEnvironmentValue: (name) => environment[name],
    };
  } catch {
    throw configurationError();
  }
}

export function configOptions(
  configuration: AIServiceConfiguration,
  profileOverride?: string,
): AIConfigOptions {
  return {
    profiles: configuration.profiles,
    tasks: configuration.tasks,
    registeredApiFormats: [GOOGLE_GENERATE_CONTENT_FORMAT],
    getEnvironmentValue: configuration.getEnvironmentValue,
    ...(profileOverride ? { profileOverride } : {}),
  };
}

export function configurationError(): AIError {
  return new AIError({
    code: "AI_CONFIG_ERROR",
    safeMessage: "AI service configuration is invalid.",
    requestId: "configuration",
    retryable: false,
  });
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}
