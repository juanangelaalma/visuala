import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/infrastructure/supabase/browser-client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { getSession: mocks.getSession } }),
}));

import { BrowserApiError, browserApiErrorMessage, browserApiFetch, browserApiStream, browserApiUpload, type BrowserStreamEvent } from "./browser-client";

describe("browser API transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = "https://api.visuala.test/api/";
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "current-access-token" } } });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("reads the current token and sends a JSON request to the configured API", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ project: { id: "project-1" } }), { status: 201 }));

    await expect(browserApiFetch<{ project: { id: string } }>("/video-projects", { method: "POST", body: { title: "Kopi" } })).resolves.toEqual({ project: { id: "project-1" } });
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("https://api.visuala.test/video-projects", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer current-access-token", "content-type": "application/json" },
      body: JSON.stringify({ title: "Kopi" }),
    }));
  });

  it("rejects a missing browser session before calling fetch", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    await expect(browserApiFetch("/video-projects")).rejects.toMatchObject({ status: 401, payload: { error: "Unauthorized." } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends raw asset bytes and required asset rights header", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ asset: { id: "asset-1" } }), { status: 201 }));

    await browserApiUpload("/video-projects/project-1/assets", { body: bytes, contentType: "image/png" });

    expect(fetch).toHaveBeenCalledWith("https://api.visuala.test/video-projects/project-1/assets", expect.objectContaining({
      method: "POST",
      headers: {
        authorization: "Bearer current-access-token",
        "content-type": "image/png",
        "x-asset-rights-confirmed": "true",
      },
      body: bytes,
    }));
  });

  it("supports empty successful responses and forwards abort signals", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(browserApiFetch("/video-projects/project-1", { method: "DELETE", signal: controller.signal })).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });

  it("rejects malformed successful JSON and safe backend failures without leaking their bodies", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid title." }), { status: 422 }));

    await expect(browserApiFetch("/video-projects")).rejects.toThrow("Invalid JSON response.");
    await expect(browserApiFetch("/video-projects")).rejects.toMatchObject({ status: 422, payload: { error: "Invalid title." } });
  });

  it("retains only the safe backend error message", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      error: "Version is unavailable.",
      url: "https://storage.visuala.test/version.mp4?signature=signed",
      detail: { requestId: "internal-request-id" },
    }), { status: 404 }));

    const error = await browserApiFetch<never>("/video-projects/project-1/versions/version-1/download").catch((reason: unknown): BrowserApiError => reason as BrowserApiError);

    expect(error).toMatchObject({ status: 404 });
    expect(error.payload).toEqual({ error: "Version is unavailable." });
  });

  it("preserves network failures without logging sensitive request data", async () => {
    const failure = new TypeError("Network unavailable");
    vi.mocked(fetch).mockRejectedValue(failure);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(browserApiFetch("/video-projects", { body: { secret: "request-body" } })).rejects.toBe(failure);
    expect(log).not.toHaveBeenCalled();
  });

  it("maps known browser API errors to safe user messages", () => {
    expect(browserApiErrorMessage(new BrowserApiError(401, { error: "Unauthorized." }), "Gagal.")).toBe("Sesi berakhir. Masuk lagi untuk melanjutkan.");
    expect(browserApiErrorMessage(new BrowserApiError(403, { error: "Forbidden." }), "Gagal.")).toBe("Kamu tidak memiliki akses ke proyek ini.");
    expect(browserApiErrorMessage(new BrowserApiError(422, { error: "Judul tidak valid." }), "Gagal.")).toBe("Judul tidak valid.");
  });

  it("publishes saved-user and text events while completion remains pending", async () => {
    const stream = controlledStream();
    vi.mocked(fetch).mockResolvedValue(stream.response);
    const events: BrowserStreamEvent[] = [];
    let notifyPreview!: () => void;
    const preview = new Promise<void>((resolve) => { notifyPreview = resolve; });
    let settled = false;
    const result = browserApiStream<{ answer: string }>("/video-projects/project-1/messages", {
      method: "POST",
      body: { content: "Pemilik kedai" },
      onEvent(event) {
        events.push(event);
        if (event.event === "text-delta") notifyPreview();
      },
    });
    void result.then(() => { settled = true; }, () => { settled = true; });
    stream.enqueue('event: message\ndata: {"message":{"id":"saved-user"}}\n\n'
      + 'event: text-delta\ndata: {"delta":"Siapa pembeli"}\n\n');

    await preview;
    expect(events).toEqual([
      { event: "message", data: { message: { id: "saved-user" } } },
      { event: "text-delta", data: { delta: "Siapa pembeli" } },
    ]);
    expect(settled).toBe(false);

    stream.enqueue('event: completed\ndata: {"answer":"Pertanyaan final"}\n\n');
    await expect(result).resolves.toEqual({ answer: "Pertanyaan final" });
    expect(events.at(-1)).toEqual({ event: "completed", data: { answer: "Pertanyaan final" } });
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.body.locked).toBe(false);
  });

  it("decodes split UTF-8, CRLF, lone CR, comments and multiline data", async () => {
    const events: BrowserStreamEvent[] = [];
    const encoded = new TextEncoder().encode(
      ': heartbeat\r\n\r\n'
      + 'event: provider-progress\r\ndata: not-json\r\n\r\n'
      + 'event: text-delta\r\ndata: {"delta":"Kopi ☕ 😀"}\r\n\r\n'
      + 'event: text-delta\rdata: {"delta":"?"}\r\r'
      + 'event: completed\r\ndata: {"answer":\r\ndata: "Kopi ☕ 😀?"}\r\n\r\n',
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8" } }));

    await expect(browserApiStream("/video-projects/project-1/messages/opening", {
      method: "POST",
      onEvent: (event) => events.push(event),
    })).resolves.toEqual({ answer: "Kopi ☕ 😀?" });
    expect(events).toEqual([
      { event: "text-delta", data: { delta: "Kopi ☕ 😀" } },
      { event: "text-delta", data: { delta: "?" } },
      { event: "completed", data: { answer: "Kopi ☕ 😀?" } },
    ]);
    expect(body.locked).toBe(false);
  });

  it("shares current browser authentication and HTTP error mapping with streaming requests", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      error: "Answer is too long.",
      providerKey: "secret",
    }), { status: 422 }));
    const controller = new AbortController();

    await expect(browserApiStream("/video-projects/project-1/messages", {
      method: "POST",
      body: { content: "Answer" },
      signal: controller.signal,
    })).rejects.toMatchObject({ status: 422, payload: { error: "Answer is too long." }, streamed: false });
    expect(fetch).toHaveBeenCalledWith("https://api.visuala.test/video-projects/project-1/messages", expect.objectContaining({
      method: "POST",
      headers: {
        authorization: "Bearer current-access-token",
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: '{"content":"Answer"}',
      signal: controller.signal,
    }));
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    await expect(browserApiStream("/video-projects/project-1/messages", { method: "POST" }))
      .rejects.toMatchObject({ status: 401, streamed: false });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("distinguishes terminal SSE failure from HTTP rejection without retaining diagnostics", async () => {
    const stream = controlledStream();
    vi.mocked(fetch).mockResolvedValue(stream.response);
    const onEvent = vi.fn();
    const result = browserApiStream("/video-projects/project-1/messages", { method: "POST", onEvent });
    stream.enqueue('event: error\ndata: {"status":503,"error":"Layanan sementara tidak tersedia.","requestId":"safe-id","diagnostics":{"providerKey":"secret"}}\n\n');

    const error = await result.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BrowserApiError);
    expect(error).toMatchObject({
      status: 503,
      payload: { error: "Layanan sementara tidak tersedia." },
      streamed: true,
    });
    expect((error as BrowserApiError).payload).toEqual({ error: "Layanan sementara tidak tersedia." });
    expect(browserApiErrorMessage(error, "Gagal.")).toBe("Layanan sementara tidak tersedia.");
    expect(onEvent).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.body.locked).toBe(false);
  });

  it.each([
    ["premature EOF", 'event: text-delta\ndata: {"delta":"Preview"}\n\n'],
    ["unterminated completion", 'event: completed\ndata: {"answer":"Final"}\n'],
    ["malformed JSON", 'event: completed\ndata: nope\n\n'],
    ["missing terminal data", 'event: completed\n\n'],
    ["null completion", 'event: completed\ndata: null\n\n'],
    ["array completion", 'event: completed\ndata: []\n\n'],
    ["scalar completion", 'event: completed\ndata: "Final"\n\n'],
    ["malformed error status", 'event: error\ndata: {"status":200,"error":"Unsafe"}\n\n'],
    ["malformed error message", 'event: error\ndata: {"status":500,"error":{"detail":"secret"}}\n\n'],
    ["missing completion", 'event: provider-progress\ndata: {}\n\n'],
  ])("rejects %s as ambiguous transport failure", async (_, records) => {
    vi.mocked(fetch).mockResolvedValue(new Response(records, { headers: { "content-type": "text/event-stream" } }));

    const error = await browserApiStream("/video-projects/project-1/messages", { method: "POST" }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(BrowserApiError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects non-SSE success and missing bodies", async () => {
    const stream = controlledStream("application/json");
    vi.mocked(fetch)
      .mockResolvedValueOnce(stream.response)
      .mockResolvedValueOnce(new Response(null, { headers: { "content-type": "text/event-stream" } }));

    await expect(browserApiStream("/messages", {})).rejects.toThrow("Invalid event stream content type.");
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.body.locked).toBe(false);
    await expect(browserApiStream("/messages", {})).rejects.toThrow("Missing event stream body.");
  });

  it("propagates feature validation failures before resolving completion and cancels the reader", async () => {
    const stream = controlledStream();
    vi.mocked(fetch).mockResolvedValue(stream.response);
    const invalid = new Error("Invalid completed DTO.");
    const result = browserApiStream("/messages", {
      onEvent(event) {
        if (event.event === "completed") throw invalid;
      },
    });
    stream.enqueue('event: completed\ndata: {"unexpected":true}\n\n');

    await expect(result).rejects.toBe(invalid);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.body.locked).toBe(false);
  });

  it("rejects an already aborted request without publishing buffered events", async () => {
    const stream = controlledStream();
    vi.mocked(fetch).mockResolvedValue(stream.response);
    stream.enqueue('event: completed\ndata: {"answer":"Final"}\n\n');
    const controller = new AbortController();
    const aborted = new DOMException("Navigation", "AbortError");
    controller.abort(aborted);
    const onEvent = vi.fn();

    await expect(browserApiStream("/messages", { signal: controller.signal, onEvent })).rejects.toBe(aborted);
    expect(onEvent).not.toHaveBeenCalled();
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.body.locked).toBe(false);
  });

  it("aborts a pending body read even when fetch does not wire the mocked body to its signal", async () => {
    const stream = controlledStream();
    vi.mocked(fetch).mockResolvedValue(stream.response);
    const controller = new AbortController();
    let sawPreview!: () => void;
    const preview = new Promise<void>((resolve) => { sawPreview = resolve; });
    const result = browserApiStream("/messages", {
      method: "POST",
      signal: controller.signal,
      onEvent: () => sawPreview(),
    });
    stream.enqueue('event: text-delta\ndata: {"delta":"Preview"}\n\n');
    await preview;
    const aborted = new DOMException("Navigation", "AbortError");
    controller.abort(aborted);

    await expect(result).rejects.toBe(aborted);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.body.locked).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps a disconnect after persistence ambiguous and never replays the POST", async () => {
    const stream = controlledStream();
    vi.mocked(fetch).mockResolvedValue(stream.response);
    let acknowledge!: () => void;
    const saved = new Promise<void>((resolve) => { acknowledge = resolve; });
    const result = browserApiStream("/messages", {
      method: "POST",
      onEvent: () => acknowledge(),
    });
    stream.enqueue('event: message\ndata: {"message":{"id":"saved-user"}}\n\n');
    await saved;
    const disconnected = new TypeError("Connection lost");
    stream.controller.error(disconnected);

    await expect(result).rejects.toBe(disconnected);
    expect(stream.body.locked).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

function controlledStream(contentType = "text/event-stream") {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel,
  });
  return {
    body,
    controller,
    cancel,
    response: new Response(body, { headers: { "content-type": contentType } }),
    enqueue(text: string) { controller.enqueue(new TextEncoder().encode(text)); },
  };
}
