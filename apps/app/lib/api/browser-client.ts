import { createSupabaseBrowserClient } from "@/infrastructure/supabase/browser-client";

export type BrowserApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export type BrowserStreamEvent = { event: string; data: unknown };

type BrowserApiUploadOptions = {
  body: BodyInit;
  contentType: string;
  signal?: AbortSignal;
};

type BrowserApiPayload = { error: string } | null;

export class BrowserApiError extends Error {
  readonly status: number;
  readonly payload: BrowserApiPayload;
  readonly streamed: boolean;

  constructor(status: number, payload: BrowserApiPayload, streamed = false) {
    super(`Backend request failed with status ${status}`);
    this.name = "BrowserApiError";
    this.status = status;
    this.payload = payload;
    this.streamed = streamed;
  }
}

export async function browserApiFetch<T>(path: string, options: BrowserApiOptions = {}): Promise<T> {
  const response = await request(path, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  return readJsonResponse<T>(response);
}

export async function browserApiUpload<T>(path: string, options: BrowserApiUploadOptions): Promise<T> {
  const response = await request(path, {
    method: "POST",
    headers: {
      "content-type": options.contentType,
      "x-asset-rights-confirmed": "true",
    },
    body: options.body,
    signal: options.signal,
  });
  return readJsonResponse<T>(response);
}

export async function browserApiStream<T>(
  path: string,
  options: BrowserApiOptions & { onEvent?: (event: BrowserStreamEvent) => void },
): Promise<T> {
  const response = await request(path, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (!response.body) throw new Error("Missing event stream body.");

  const reader = response.body.getReader();
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = options.signal
    ? new Promise<never>((_, reject) => { rejectAbort = reject; })
    : undefined;
  const onAbort = () => rejectAbort?.(options.signal?.reason ?? new DOMException("Aborted", "AbortError"));
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    options.signal?.throwIfAborted();
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "text/event-stream") throw new Error("Invalid event stream content type.");

    let completed = false;
    let result: unknown;
    const consume = createStreamRecordReader((event) => {
      options.signal?.throwIfAborted();
      if (event.event === "error") throw toStreamError(event.data);
      if (event.event === "completed" && !isObject(event.data)) {
        throw new Error("Invalid event stream completion.");
      }
      options.onEvent?.(event);
      options.signal?.throwIfAborted();
      if (event.event === "completed") {
        result = event.data;
        completed = true;
      }
    });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    while (!completed) {
      const reading = reader.read();
      const { done, value } = await (aborted ? Promise.race([reading, aborted]) : reading);
      options.signal?.throwIfAborted();
      consume(done ? decoder.decode() : decoder.decode(value, { stream: true }));
      if (done && !completed) throw new Error("Event stream ended before completion.");
    }
    return result as T;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function createStreamRecordReader(onEvent: (event: BrowserStreamEvent) => void): (text: string) => void {
  let line = "";
  let afterCarriageReturn = false;
  let event = "message";
  let data: string[] = [];
  let terminal = false;

  const consumeLine = () => {
    if (line === "") {
      const eventName = event;
      const recordData = data;
      event = "message";
      data = [];
      if (eventName !== "message" && eventName !== "text-delta" && eventName !== "completed" && eventName !== "error") return;
      if (recordData.length === 0) {
        if (eventName === "completed" || eventName === "error") throw new Error("Missing event stream data.");
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(recordData.join("\n"));
      } catch {
        throw new Error("Invalid event stream JSON.");
      }
      onEvent({ event: eventName, data: payload });
      terminal = eventName === "completed";
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value || "message";
    if (field === "data") data.push(value);
  };

  return (text) => {
    for (const character of text) {
      if (terminal) return;
      if (afterCarriageReturn && character === "\n") {
        afterCarriageReturn = false;
        continue;
      }
      afterCarriageReturn = character === "\r";
      if (character === "\r" || character === "\n") {
        consumeLine();
        line = "";
      } else {
        line += character;
      }
    }
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStreamError(payload: unknown): BrowserApiError {
  if (!isObject(payload) || typeof payload.status !== "number" || !Number.isInteger(payload.status)
    || payload.status < 400 || payload.status > 599 || typeof payload.error !== "string" || !payload.error.trim()) {
    throw new Error("Invalid event stream error.");
  }
  return new BrowserApiError(payload.status, { error: payload.error }, true);
}

async function request(path: string, init: RequestInit): Promise<Response> {
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

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    throw new BrowserApiError(response.status, toSafeErrorPayload(payload));
  }
  return response;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => undefined);
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
