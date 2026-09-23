import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/infrastructure/supabase/browser-client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { getSession: mocks.getSession } }),
}));

import { BrowserApiError, browserApiErrorMessage, browserApiFetch, browserApiUpload } from "./browser-client";

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
});
