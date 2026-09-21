import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), requireUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/supabase/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/shared/config/env", () => ({ getAppEnv: () => ({ NEXT_PUBLIC_API_URL: "http://localhost:4000" }) }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();

  return { ...actual, apiUpload: mocks.upload };
});

import { ApiError } from "@/lib/api/client";
import { MAX_ASSET_BYTES } from "../schemas/video-project-schema";
import { uploadProjectAssetAction } from "./upload-project-asset-action";

function pngFile() {
  return new File([new Uint8Array([1, 2, 3, 4])], "foto.png", { type: "image/png" });
}

function assetForm(overrides: { projectId?: string; file?: File; rightsConfirmed?: string } = {}) {
  const form = new FormData();
  form.set("projectId", overrides.projectId ?? "project-1");
  form.set("file", overrides.file ?? pngFile());
  form.set("rightsConfirmed", overrides.rightsConfirmed ?? "true");
  return form;
}

function withSize(file: File, size: number) {
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("uploadProjectAssetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
  });

  it("authenticates before rejecting an incomplete form", async () => {
    expect(await uploadProjectAssetAction(new FormData())).toEqual({ error: "Proyek tidak ditemukan." });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("requires a file", async () => {
    const form = new FormData();
    form.set("projectId", "project-1");
    form.set("rightsConfirmed", "true");

    expect(await uploadProjectAssetAction(form)).toEqual({ error: "Pilih file gambar terlebih dahulu." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("requires the asset rights confirmation", async () => {
    expect(await uploadProjectAssetAction(assetForm({ rightsConfirmed: "false" }))).toEqual({ error: "Konfirmasikan hak penggunaan aset." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects an unsupported content type", async () => {
    const file = new File([new Uint8Array([1])], "animasi.gif", { type: "image/gif" });

    expect(await uploadProjectAssetAction(assetForm({ file }))).toEqual({ error: "Format gambar harus JPEG, PNG, atau WebP." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects a file above the backend limit", async () => {
    const file = withSize(pngFile(), MAX_ASSET_BYTES + 1);

    expect(await uploadProjectAssetAction(assetForm({ file }))).toEqual({ error: "Ukuran gambar maksimal 10 MB." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads the raw bytes with the content type and rights header", async () => {
    mocks.upload.mockResolvedValue({ asset: { id: "asset-1" } });

    expect(await uploadProjectAssetAction(assetForm())).toEqual({ asset: { id: "asset-1" } });

    const [path, options] = mocks.upload.mock.calls[0];
    expect(path).toBe("/video-projects/project-1/assets");
    expect(options).toMatchObject({ contentType: "image/png", headers: { "x-asset-rights-confirmed": "true" } });
    expect(options.body).toBeInstanceOf(ArrayBuffer);
  });

  it("encodes the project id in the path", async () => {
    mocks.upload.mockResolvedValue({ asset: { id: "asset-1" } });

    await uploadProjectAssetAction(assetForm({ projectId: "project/2" }));

    expect(mocks.upload.mock.calls[0][0]).toBe("/video-projects/project%2F2/assets");
  });

  it("surfaces the backend message", async () => {
    mocks.upload.mockRejectedValue(new ApiError(422, { error: "This project already has the maximum number of images." }));

    expect(await uploadProjectAssetAction(assetForm())).toEqual({ error: "This project already has the maximum number of images." });
  });

  it("asks the user to sign in when the session is missing", async () => {
    mocks.upload.mockRejectedValue(new ApiError(401, { error: "Unauthorized." }));

    expect(await uploadProjectAssetAction(assetForm())).toEqual({ error: "Masuk untuk melanjutkan." });
  });

  it("falls back to a safe message for unexpected failures", async () => {
    mocks.upload.mockRejectedValue(new Error("backend detail"));

    expect(await uploadProjectAssetAction(assetForm())).toEqual({ error: "Tidak dapat mengunggah gambar." });
  });
});
