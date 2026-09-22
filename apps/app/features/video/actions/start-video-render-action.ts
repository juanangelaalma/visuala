"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import type { VideoRenderJob } from "@/domain/video/types";

export type StartVideoRenderResult = { error?: string; message?: string };

export async function startVideoRenderAction(_: StartVideoRenderResult, formData: FormData): Promise<StartVideoRenderResult> {
  await requireUser();

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) return { error: "Proyek tidak ditemukan." };

  try {
    await apiFetch<{ job: VideoRenderJob }>(`/video-projects/${encodeURIComponent(projectId)}/render-jobs`, {
      method: "POST",
      // Minted per submission, so two submits carry two different keys. What makes a double submit
      // safe is the backend's conditional `approved -> rendering` transition plus its active-job
      // check: the second request finds the project no longer approved and is refused.
      body: { idempotencyKey: randomUUID() },
    });
  } catch (error) {
    console.error("Failed to queue a render", error);
    return { error: apiErrorMessage(error, "Tidak dapat memulai render.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }

  revalidatePath(`/dashboard/videos/${projectId}`);
  return { message: "Render dimulai. Halaman ini akan memperbarui sendiri." };
}
