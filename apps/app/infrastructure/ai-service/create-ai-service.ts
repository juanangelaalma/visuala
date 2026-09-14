import "server-only";

import type { ZodType } from "zod";
import { DefaultAIService } from "../../application/ai-service/ai-service";
import { resolveOwnedAsset } from "../../application/ai-service/resolve-asset";
import { checkAIConfig, resolveAIConfig } from "../../application/ai-service/resolve-config";
import type { ResolvedAIConfig } from "../../domain/ai-service/config";
import type { AIService, ProviderAdapter } from "../../domain/ai-service/contracts";
import type { AITask } from "../../domain/ai-service/types";
import { createSupabaseServiceRoleClient } from "../supabase/service-role-client";
import {
  configOptions,
  configurationError,
  GOOGLE_GENERATE_CONTENT_FORMAT,
  readAIServiceConfiguration,
  type AIServiceEnvironment,
} from "./config";
import { GoogleGenerateContentAdapter } from "./google-generate-content-adapter";
import { processConcurrencyLimiter, tightenProcessConcurrencyLimiter } from "./process-concurrency-limiter";
import { R2ObjectStore } from "./r2-object-store";
import { SupabaseAssetRepository } from "./supabase-asset-repository";
import { SupabaseUsageRecorder } from "./supabase-usage-recorder";

type FactoryOptions = {
  environment?: AIServiceEnvironment;
  profileOverride?: string;
  schemas?: Readonly<Record<string, ZodType>>;
};

export type AIConfigurationCheck = {
  status: "valid";
  profiles: Array<{ id: string; provider: string; model: string | null }>;
  tasks: Array<{ task: AITask; profileId: string }>;
};

export function createAIService(options: FactoryOptions = {}): AIService {
  validateSchemaKeys(options.schemas);
  return buildAIService(options);
}

export function checkConfiguredAIService(options: FactoryOptions = {}): AIConfigurationCheck {
  validateSchemaKeys(options.schemas);
  const configuration = readAIServiceConfiguration(options.environment);
  const optionsForCheck = configOptions(configuration, options.profileOverride);
  const activeProfileIds = new Set(checkAIConfig(optionsForCheck));
  const profiles = configuration.profiles.map((profile) => ({
    id: profile.id,
    provider: profile.provider,
    model: activeProfileIds.has(profile.id) ? configuration.getEnvironmentValue(profile.modelIdEnv)?.trim() || null : null,
  }));
  const tasks = configuration.tasks.map(({ task }) => ({
    task,
    profileId: resolveAIConfig(task, task === "connection_test" ? optionsForCheck : configOptions(configuration)).profileId,
  }));
  return { status: "valid", profiles, tasks };
}

function buildAIService(options: FactoryOptions): AIService {
  const configuration = readAIServiceConfiguration(options.environment);
  const environment = options.environment ?? process.env;
  const supabase = createSupabaseServiceRoleClient(environment);
  const assetRepository = new SupabaseAssetRepository(supabase);
  const objectStore = new R2ObjectStore(environment);
  return new DefaultAIService({
    resolveConfig: (task) => resolveAIConfig(task, configOptions(configuration, options.profileOverride)),
    getAdapter: (config) => adapterFor(config, options.schemas),
    assetResolver: { resolve: (assetId, userId, limits) => resolveOwnedAsset({ assetId, userId, limits }, { repository: assetRepository, objectStore }) },
    usageRecorder: new SupabaseUsageRecorder(supabase),
    now: Date.now,
    sleep,
    random: Math.random,
    createId: () => crypto.randomUUID(),
    limiter: processConcurrencyLimiter(configuration.maximumConcurrency),
    tightenLimiter: tightenProcessConcurrencyLimiter,
    scheduler: { setTimeout, clearTimeout },
  });
}

function adapterFor(config: ResolvedAIConfig, schemas?: Readonly<Record<string, ZodType>>): ProviderAdapter {
  if (config.apiFormat !== GOOGLE_GENERATE_CONTENT_FORMAT) throw configurationError();
  return new GoogleGenerateContentAdapter({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelId: config.modelId,
    maxOutputTokens: config.limits.maxOutputTokens,
    schemas,
  });
}

function validateSchemaKeys(schemas?: Readonly<Record<string, ZodType>>): void {
  if (!schemas) return;
  if (Object.keys(schemas).some((key) => !/^[^@\s]+@[^@\s]+$/.test(key))) throw configurationError();
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}
