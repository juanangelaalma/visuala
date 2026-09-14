import { z } from "zod";
import type {
  AIConfigOptions,
  AIProfileLimits,
  ResolvedAIConfig,
} from "../../domain/ai-service/config";
import { AIError } from "../../domain/ai-service/errors";
import type { AITask } from "../../domain/ai-service/types";

const DEFAULT_ATTEMPT_TIMEOUT_MS = 30_000;
const DEFAULT_TOTAL_DEADLINE_MS = 65_000;
const DEFAULT_MAX_ATTEMPTS = 2;

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
  attemptTimeoutMs: positiveInteger.default(DEFAULT_ATTEMPT_TIMEOUT_MS),
  totalDeadlineMs: positiveInteger.default(DEFAULT_TOTAL_DEADLINE_MS),
  maxAttempts: positiveInteger.default(DEFAULT_MAX_ATTEMPTS),
}).refine(
  ({ attemptTimeoutMs, totalDeadlineMs }) => totalDeadlineMs >= attemptTimeoutMs,
);
const taskLimitsSchema = z.object({
  maxInputCharacters: positiveInteger.optional(),
  maxOutputTokens: positiveInteger.optional(),
  maxImages: nonnegativeInteger.optional(),
  maxImageBytes: positiveInteger.optional(),
  maxImageWidth: positiveInteger.optional(),
  maxImageHeight: positiveInteger.optional(),
  maxConcurrency: positiveInteger.optional(),
}).optional();
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
  baseUrl: z.string().trim().min(1),
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
  limits: taskLimitsSchema,
});

export function resolveAIConfig(
  task: AITask,
  options: AIConfigOptions,
): ResolvedAIConfig {
  try {
    return resolveValidatedConfig(task, options);
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw configError();
  }
}

export function checkAIConfig(options: AIConfigOptions): string[] {
  try {
    const tasks = z.array(taskSchema).parse(options.tasks);
    return tasks.map(({ task }) =>
      resolveAIConfig(task, optionsForConfigCheck(task, options)).profileId,
    );
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw configError();
  }
}

function optionsForConfigCheck(
  task: AITask,
  options: AIConfigOptions,
): AIConfigOptions {
  if (task === "connection_test") return options;
  return { ...options, profileOverride: undefined };
}

function resolveValidatedConfig(
  task: AITask,
  options: AIConfigOptions,
): ResolvedAIConfig {
  const profiles = z.array(profileSchema).parse(options.profiles);
  const tasks = z.array(taskSchema).parse(options.tasks);
  const taskConfig = tasks.find((candidate) => candidate.task === task);
  if (!taskConfig) throw configError();
  const profileId = resolveProfileId(task, taskConfig.profileId, options);
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw configError();
  validateApiFormat(profile.apiFormat, options.registeredApiFormats);
  validateTaskLimits(taskConfig.limits, profile.limits);
  return makeResolvedConfig(profile, taskConfig.limits, options);
}

function resolveProfileId(
  task: AITask,
  mappedProfileId: string,
  options: AIConfigOptions,
): string {
  if (!options.profileOverride) return mappedProfileId;
  if (task !== "connection_test") throw configError();
  return options.profileOverride;
}

function validateApiFormat(
  apiFormat: string,
  registeredApiFormats: readonly string[],
): void {
  if (!registeredApiFormats.includes(apiFormat)) throw configError();
}

function validateTaskLimits(
  taskLimits: Record<string, number> | undefined,
  profileLimits: Required<AIProfileLimits>,
): void {
  if (!taskLimits) return;
  for (const [name, value] of Object.entries(taskLimits)) {
    if (value > profileLimits[name as keyof AIProfileLimits]!) throw configError();
  }
}

function makeResolvedConfig(
  profile: z.infer<typeof profileSchema>,
  taskLimits: z.infer<typeof taskLimitsSchema>,
  options: AIConfigOptions,
): ResolvedAIConfig {
  const apiKey = requiredEnvironmentValue(profile.apiKeyEnv, options);
  const modelId = requiredEnvironmentValue(profile.modelIdEnv, options);
  const limits = Object.freeze({ ...profile.limits, ...taskLimits });
  return Object.freeze({
    profileId: profile.id,
    apiFormat: profile.apiFormat,
    baseUrl: normalizeBaseUrl(profile.baseUrl, options.allowInsecureLoopback),
    apiKey,
    modelId,
    provider: profile.provider,
    capabilities: Object.freeze({ ...profile.capabilities }),
    limits,
    ...(profile.pricing ? { pricing: Object.freeze({ ...profile.pricing }) } : {}),
  });
}

function requiredEnvironmentValue(
  name: string,
  options: AIConfigOptions,
): string {
  const value = options.getEnvironmentValue(name)?.trim();
  if (!value) throw configError();
  return value;
}

function normalizeBaseUrl(value: string, allowInsecureLoopback = false): string {
  const url = new URL(value);
  if (!isTrustedBaseUrl(url, allowInsecureLoopback)) throw new Error("Unsafe AI base URL");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.toString();
}

function isTrustedBaseUrl(url: URL, allowInsecureLoopback: boolean): boolean {
  return (
    (url.protocol === "https:" || (allowInsecureLoopback && url.protocol === "http:" && isLoopbackHost(url.hostname))) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function configError(): AIError {
  return new AIError({
    code: "AI_CONFIG_ERROR",
    safeMessage: "AI service configuration is invalid.",
    requestId: "configuration",
    retryable: false,
  });
}
