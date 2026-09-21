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
import { deleteVideoProjectAction } from "./delete-video-project-action";

function deleteForm(projectId = "project-1") {
  const form = new FormData();
  form.set("projectId", projectId);
  return form;
}

describe("deleteVideoProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.api.mockResolvedValue({ pendingObjectDeletions: 0 });
  });

  it("authenticates before ignoring a missing project id", async () => {
    expect(await deleteVideoProjectAction(new FormData())).toEqual({ error: "Proyek tidak ditemukan." });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("deletes the project and revalidates the library", async () => {
    expect(await deleteVideoProjectAction(deleteForm())).toEqual({ message: "Proyek dihapus." });
    expect(mocks.api).toHaveBeenCalledWith("/video-projects/project-1", { method: "DELETE" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/videos");
  });

  it("surfaces a delete failure without revalidating", async () => {
    mocks.api.mockRejectedValue(new ApiError(404, { error: "The video project was not found." }));

    expect(await deleteVideoProjectAction(deleteForm())).toEqual({ error: "The video project was not found." });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
