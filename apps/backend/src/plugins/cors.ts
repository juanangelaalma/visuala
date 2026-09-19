import { cors } from "@elysiajs/cors";

const DEFAULT_ORIGIN = "http://localhost:3000";

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? DEFAULT_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  return allowedOrigins().includes(origin);
}

export const corsPlugin = cors({
  origin: (request) => isAllowedOrigin(request.headers.get("origin")),
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Callback-Token"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
