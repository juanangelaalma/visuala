"use server";

import type { VideoProject } from "@/domain/video/types";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import { videoProjectFormSchema } from "../schemas/video-project-schema";

export type CreateVideoProjectResult = { projectId: string } | { error: string };

/**
 * Creates the project before any asset is uploaded, because the backend only accepts an asset once
 * a project id exists. The setup form calls this, then uploads the selected files against the id.
 */
export async function createVideoProjectAction(formData: FormData): Promise<CreateVideoProjectResult> {
  await requireUser();

  const parsed = videoProjectFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Periksa kembali pengaturan video." };

  const { title, videoType, styleId, durationSeconds, aspectRatio, resolution, language, voiceOverEnabled, musicEnabled } = parsed.data;

  try {
    const { project } = await apiFetch<{ project: VideoProject }>("/video-projects", {
      method: "POST",
      body: {
        title,
        videoType,
        styleId,
        settings: { durationSeconds, aspectRatio, resolution, language, voiceOverEnabled, musicEnabled },
      },
    });

    return { projectId: project.id };
  } catch (error) {
    console.error("Failed to create video project", error);
    return { error: apiErrorMessage(error, "Tidak dapat membuat proyek video.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }
}
