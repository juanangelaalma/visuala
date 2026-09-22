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

import { ApiError } from "@/lib/api/client";
import { approveVideoProjectAction } from "./approve-video-project-action";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function approveForm(projectId = PROJECT_ID) {
  const form = new FormData();
  form.set("projectId", projectId);
  return form;
}

describe("approveVideoProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.api.mockResolvedValue({ project: { id: PROJECT_ID }, approval: {} });
  });

  it("authenticates before ignoring a missing project id", async () => {
    expect(await approveVideoProjectAction({}, new FormData())).toEqual({ error: "Proyek tidak ditemukan." });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("approves the project and revalidates the workspace", async () => {
    expect(await approveVideoProjectAction({}, approveForm())).toEqual({ message: "Brief dan storyboard disetujui." });
    expect(mocks.api).toHaveBeenCalledWith(`/video-projects/${PROJECT_ID}/approve`, { method: "POST" });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/videos/${PROJECT_ID}`);
  });

  it("surfaces an incomplete approval and does not revalidate", async () => {
    mocks.api.mockRejectedValue(new ApiError(409, { error: "The brief is missing: callToAction." }));

    expect(await approveVideoProjectAction({}, approveForm())).toEqual({ error: "The brief is missing: callToAction." });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("falls back to a safe message for unexpected failures", async () => {
    mocks.api.mockRejectedValue(new Error("backend detail"));

    expect(await approveVideoProjectAction({}, approveForm())).toEqual({ error: "Tidak dapat menyetujui brief." });
  });
});
