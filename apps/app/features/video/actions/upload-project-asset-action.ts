"use server";

import type { ProjectAsset } from "@/domain/video/types";
import { apiErrorMessage, apiUpload } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import { MAX_ASSET_BYTES, isSupportedAssetMimeType } from "../schemas/video-project-schema";

export type UploadProjectAssetResult = { asset: ProjectAsset } | { error: string };

/**
 * Sends one image as raw bytes. The backend checks the declared content type and the bytes
 * themselves, and refuses the upload unless the rights header confirms the user may use it.
 */
export async function uploadProjectAssetAction(formData: FormData): Promise<UploadProjectAssetResult> {
  await requireUser();

  const projectId = formData.get("projectId");
  const file = formData.get("file");
  const rightsConfirmed = formData.get("rightsConfirmed") === "true";

  if (typeof projectId !== "string" || projectId.length === 0) return { error: "Proyek tidak ditemukan." };
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file gambar terlebih dahulu." };
  if (!rightsConfirmed) return { error: "Konfirmasikan hak penggunaan aset." };
  if (!isSupportedAssetMimeType(file.type)) return { error: "Format gambar harus JPEG, PNG, atau WebP." };
  if (file.size > MAX_ASSET_BYTES) return { error: "Ukuran gambar maksimal 10 MB." };

  try {
    const { asset } = await apiUpload<{ asset: ProjectAsset }>(`/video-projects/${encodeURIComponent(projectId)}/assets`, {
      body: await file.arrayBuffer(),
      contentType: file.type,
      headers: { "x-asset-rights-confirmed": "true" },
    });

    return { asset };
  } catch (error) {
    console.error("Failed to upload project asset", error);
    return { error: apiErrorMessage(error, "Tidak dapat mengunggah gambar.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }
}
