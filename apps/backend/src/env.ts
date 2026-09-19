import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_EMAILS: z.string().default(""),
});

export type BackendEnv = z.infer<typeof envSchema>;

export function readEnv(environment: Record<string, string | undefined> = process.env): BackendEnv {
  return envSchema.parse(environment);
}

let cachedEnv: BackendEnv | null = null;

export function getEnv(): BackendEnv {
  cachedEnv ??= readEnv();
  return cachedEnv;
}
