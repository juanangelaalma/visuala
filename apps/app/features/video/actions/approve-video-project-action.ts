"use server";

import { revalidatePath } from "next/cache";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

export type ApproveVideoProjectResult = { error?: string; message?: string };

export async function approveVideoProjectAction(_: ApproveVideoProjectResult, formData: FormData): Promise<ApproveVideoProjectResult> {
  await requireUser();

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) return { error: "Proyek tidak ditemukan." };

  try {
    await apiFetch(`/video-projects/${encodeURIComponent(projectId)}/approve`, { method: "POST" });
  } catch (error) {
    console.error("Failed to approve video project", error);
    return { error: apiErrorMessage(error, "Tidak dapat menyetujui brief.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }

  revalidatePath(`/dashboard/videos/${projectId}`);
  return { message: "Brief dan storyboard disetujui." };
}
