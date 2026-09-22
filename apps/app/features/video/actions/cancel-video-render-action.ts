"use server";

import { revalidatePath } from "next/cache";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

export type CancelVideoRenderResult = { error?: string; message?: string };

/**
 * Cancellation is only valid while the job is still `queued`; the backend refuses anything else with
 * `video_state_conflict`, which is why the fallback message describes a render that already started.
 */
export async function cancelVideoRenderAction(_: CancelVideoRenderResult, formData: FormData): Promise<CancelVideoRenderResult> {
  await requireUser();

  const projectId = formData.get("projectId");
  const jobId = formData.get("jobId");
  if (typeof projectId !== "string" || projectId.length === 0) return { error: "Proyek tidak ditemukan." };
  if (typeof jobId !== "string" || jobId.length === 0) return { error: "Render tidak ditemukan." };

  try {
    await apiFetch(`/video-projects/${encodeURIComponent(projectId)}/render-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  } catch (error) {
    console.error("Failed to cancel a render", error);
    return { error: apiErrorMessage(error, "Render sudah berjalan dan tidak bisa dibatalkan.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }

  revalidatePath(`/dashboard/videos/${projectId}`);
  return { message: "Render dibatalkan." };
}
