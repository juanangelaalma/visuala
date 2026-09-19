import "server-only";

import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { getAppEnv } from "@/shared/config/env";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, payload: unknown) {
    super(`Backend request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  cache?: RequestInit["cache"];
  accessToken?: string;
};

async function resolveAccessToken(explicitToken?: string): Promise<string | null> {
  if (explicitToken) return explicitToken;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();

  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const env = getAppEnv();
  const accessToken = await resolveAccessToken(options.accessToken);
  const response = await fetch(new URL(path, env.NEXT_PUBLIC_API_URL), {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: options.cache ?? "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) throw new ApiError(response.status, payload);

  return payload as T;
}

type ApiErrorMessageOptions = {
  unauthorized?: string;
};

export function apiErrorMessage(error: unknown, fallback: string, options: ApiErrorMessageOptions = {}): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401 && options.unauthorized) return options.unauthorized;

  const payload = error.payload;
  if (payload && typeof payload === "object" && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === "string" && message.length > 0) return message;
  }

  return fallback;
}
