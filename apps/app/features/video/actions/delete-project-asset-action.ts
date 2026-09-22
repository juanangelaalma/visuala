"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

export type DeleteProjectAssetResult = { error?: string; message?: string };

const deleteProjectAssetSchema = z
  .object({
    projectId: z.string().uuid(),
    assetId: z.string().uuid(),
  })
  .strict();

/**
 * Removes an asset row and its object. This is also the way out of a stale row: when the stored
 * object is gone the workspace can only show a placeholder, and deleting the row frees the slot
 * against the per-project asset cap.
 */
export async function deleteProjectAssetAction(formData: FormData): Promise<DeleteProjectAssetResult> {
  await requireUser();

  const parsed = deleteProjectAssetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Aset tidak ditemukan." };

  const { projectId, assetId } = parsed.data;

  try {
    await apiFetch(`/video-projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
  } catch (error) {
    console.error("Failed to delete project asset", error);
    return { error: apiErrorMessage(error, "Tidak dapat menghapus aset.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }

  revalidatePath(`/dashboard/videos/${projectId}`);
  return { message: "Aset dihapus." };
}
