import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { z } from 'zod';

const localEnvironmentFile = new URL('../../.env', import.meta.url);

const booleanFromString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

export const ConfigSchema = z.object({
  SCRAPER_API_KEY: z.string().min(16),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  HEADLESS: booleanFromString,
  PLAYWRIGHT_EXECUTABLE_PATH: z.string().min(1).optional(),
  JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).default(45_000),
  NAVIGATION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(25_000),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  RESULT_TTL_MS: z.coerce.number().int().min(1000).default(86_400_000),
});

export type Config = z.infer<typeof ConfigSchema>;
export const loadConfig = (environment?: NodeJS.ProcessEnv) => {
  if (!environment && existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
  }

  return ConfigSchema.parse(environment ?? process.env);
};
