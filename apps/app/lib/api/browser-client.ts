import { createSupabaseBrowserClient } from "@/infrastructure/supabase/browser-client";

export type BrowserApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

type BrowserApiUploadOptions = {
  body: BodyInit;
  contentType: string;
  signal?: AbortSignal;
};

type BrowserApiPayload = { error: string } | null;

export class BrowserApiError extends Error {
  readonly status: number;
  readonly payload: BrowserApiPayload;

  constructor(status: number, payload: BrowserApiPayload) {
    super(`Backend request failed with status ${status}`);
    this.name = "BrowserApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function browserApiFetch<T>(path: string, options: BrowserApiOptions = {}): Promise<T> {
  return request<T>(path, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

export async function browserApiUpload<T>(path: string, options: BrowserApiUploadOptions): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: {
      "content-type": options.contentType,
      "x-asset-rights-confirmed": "true",
    },
    body: options.body,
    signal: options.signal,
  });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new BrowserApiError(401, { error: "Unauthorized." });

  const response = await fetch(new URL(path, process.env.NEXT_PUBLIC_API_URL).toString(), {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throw new BrowserApiError(response.status, toSafeErrorPayload(payload));
  if (payload === undefined) throw new Error("Invalid JSON response.");

  return payload as T;
}

function toSafeErrorPayload(payload: unknown): BrowserApiPayload {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return null;
  const error = payload.error;
  return typeof error === "string" ? { error } : null;
}

export function browserApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof BrowserApiError)) return fallback;
  if (error.status === 401) return "Sesi berakhir. Masuk lagi untuk melanjutkan.";
  if (error.status === 403) return "Kamu tidak memiliki akses ke proyek ini.";

  const message = error.payload?.error;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}
