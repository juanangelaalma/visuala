import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  ADMIN_EMAILS: z.string().default(""),
  NEXT_PUBLIC_VIDEO_MOCK: z.string().default("1"),
  NEXT_PUBLIC_VIDEO_MOCK_SRC: z.string().default(""),
});

type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getAppEnv(): AppEnv {
  cachedEnv ??= envSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    NEXT_PUBLIC_VIDEO_MOCK: process.env.NEXT_PUBLIC_VIDEO_MOCK,
    NEXT_PUBLIC_VIDEO_MOCK_SRC: process.env.NEXT_PUBLIC_VIDEO_MOCK_SRC,
  });

  return cachedEnv;
}
