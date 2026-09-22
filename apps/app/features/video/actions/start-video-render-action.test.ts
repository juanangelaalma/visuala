import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), requireUser: vi.fn(), revalidate: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/infrastructure/supabase/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/shared/config/env", () => ({ getAppEnv: () => ({ NEXT_PUBLIC_API_URL: "http://localhost:4000" }) }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();

  return { ...actual, apiFetch: mocks.api };
});

import { ApiError, apiFetch } from "@/lib/api/client";
import { startVideoRenderAction } from "./start-video-render-action";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function renderForm(projectId = PROJECT_ID) {
  const form = new FormData();
  form.set("projectId", projectId);
  return form;
}

describe("startVideoRenderAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.api.mockResolvedValue({ job: { id: "job-1", status: "queued" } });
  });

  it("authenticates before rejecting a missing project id", async () => {
    expect(await startVideoRenderAction({}, new FormData())).toEqual({ error: "Proyek tidak ditemukan." });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("posts an idempotency key with the render request", async () => {
    await startVideoRenderAction({}, renderForm());

    expect(apiFetch).toHaveBeenCalledWith(`/video-projects/${PROJECT_ID}/render-jobs`, expect.objectContaining({ method: "POST" }));
    const body = vi.mocked(apiFetch).mock.calls[0]?.[1]?.body as { idempotencyKey: string };
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("mints a different key per submission, so a double submit cannot reuse one", async () => {
    await startVideoRenderAction({}, renderForm());
    await startVideoRenderAction({}, renderForm());

    const first = vi.mocked(apiFetch).mock.calls[0]?.[1]?.body as { idempotencyKey: string };
    const second = vi.mocked(apiFetch).mock.calls[1]?.[1]?.body as { idempotencyKey: string };
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("queues the render and revalidates the workspace", async () => {
    expect(await startVideoRenderAction({}, renderForm())).toEqual({ message: "Render dimulai. Halaman ini akan memperbarui sendiri." });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/videos/${PROJECT_ID}`);
  });

  it("answers a quota refusal with the backend's own explanation", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, { code: "video_revision_quota_exhausted", error: "This project has used all three rerenders." }));

    await expect(startVideoRenderAction({}, renderForm())).resolves.toEqual({ error: "This project has used all three rerenders." });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("falls back to a safe message for an unexpected failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("backend detail"));

    expect(await startVideoRenderAction({}, renderForm())).toEqual({ error: "Tidak dapat memulai render." });
  });
});
