"use server";

import { revalidatePath } from "next/cache";
import type { VideoMessage, VideoProject } from "@/domain/video/types";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import { videoMessageSchema } from "../schemas/video-message-schema";

export type SendVideoMessageResult = {
  error?: string;
  message?: VideoMessage;
  reply?: VideoMessage;
  project?: VideoProject;
};

/**
 * One chat turn. The backend answers with the user's message, the interviewer's reply, and the
 * project as it stands, so the page can be revalidated and re-rendered from one response.
 */
export async function sendVideoMessageAction(formData: FormData): Promise<SendVideoMessageResult> {
  await requireUser();

  const parsed = videoMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Periksa pesan Anda." };

  const { projectId, content } = parsed.data;

  try {
    const result = await apiFetch<{ message: VideoMessage; reply: VideoMessage; project: VideoProject }>(
      `/video-projects/${encodeURIComponent(projectId)}/messages`,
      { method: "POST", body: { content } },
    );

    revalidatePath(`/dashboard/videos/${projectId}`);
    return { message: result.message, reply: result.reply, project: result.project };
  } catch (error) {
    console.error("Failed to send video message", error);
    return { error: apiErrorMessage(error, "Tidak dapat mengirim pesan.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }
}
