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
import { deleteProjectAssetAction } from "./delete-project-asset-action";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

function deleteForm(projectId = PROJECT_ID, assetId = ASSET_ID) {
  const form = new FormData();
  form.set("projectId", projectId);
  form.set("assetId", assetId);
  return form;
}

describe("deleteProjectAssetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.api.mockResolvedValue({ deleted: true });
  });

  it("authenticates before rejecting an incomplete form", async () => {
    expect(await deleteProjectAssetAction(new FormData())).toEqual({ error: "Aset tidak ditemukan." });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("deletes the asset and revalidates the workspace", async () => {
    expect(await deleteProjectAssetAction(deleteForm())).toEqual({ message: "Aset dihapus." });
    expect(mocks.api).toHaveBeenCalledWith(`/video-projects/${PROJECT_ID}/assets/${ASSET_ID}`, { method: "DELETE" });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/videos/${PROJECT_ID}`);
  });

  it("rejects a non-uuid id rather than calling the backend", async () => {
    expect(await deleteProjectAssetAction(deleteForm(PROJECT_ID, "not-a-uuid"))).toEqual({ error: "Aset tidak ditemukan." });
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("surfaces a state conflict when the project no longer accepts asset changes", async () => {
    mocks.api.mockRejectedValue(new ApiError(409, { error: "Assets cannot change while the video is being rendered." }));

    expect(await deleteProjectAssetAction(deleteForm())).toEqual({ error: "Assets cannot change while the video is being rendered." });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("falls back to a safe message for unexpected failures", async () => {
    mocks.api.mockRejectedValue(new Error("backend detail"));

    expect(await deleteProjectAssetAction(deleteForm())).toEqual({ error: "Tidak dapat menghapus aset." });
  });
});
