"use server";

import { revalidatePath } from "next/cache";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

export type DeleteVideoProjectResult = { error?: string; message?: string };

export async function deleteVideoProjectAction(formData: FormData): Promise<DeleteVideoProjectResult> {
  await requireUser();

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) return { error: "Proyek tidak ditemukan." };

  try {
    await apiFetch(`/video-projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  } catch (error) {
    console.error("Failed to delete video project", error);
    return { error: apiErrorMessage(error, "Tidak dapat menghapus proyek.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }

  revalidatePath("/dashboard/videos");
  return { message: "Proyek dihapus." };
}
