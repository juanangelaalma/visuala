"use server";

import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import { videoRenderJobListSchema, videoVersionListSchema, type RenderStatus } from "../schemas/render-schema";

export type GetVideoRenderStatusResult = { status?: RenderStatus; error?: string };

/**
 * The panel's poll target. It reads both endpoints in parallel so one round trip refreshes the whole
 * panel, and it returns data rather than a message, because the caller renders it.
 */
export async function getVideoRenderStatusAction(input: { projectId: string }): Promise<GetVideoRenderStatusResult> {
  await requireUser();

  const path = `/video-projects/${encodeURIComponent(input.projectId)}`;
  try {
    const [jobs, versions] = await Promise.all([
      apiFetch<unknown>(`${path}/render-jobs`),
      apiFetch<unknown>(`${path}/versions`),
    ]);
    // A shape the panel cannot render is reported as a failure rather than rendered as blanks.
    return {
      status: {
        jobs: videoRenderJobListSchema.parse(jobs).jobs,
        versions: videoVersionListSchema.parse(versions).versions,
      },
    };
  } catch (error) {
    console.error("Failed to read render status", error);
    return { error: apiErrorMessage(error, "Tidak dapat memuat status render.", { unauthorized: "Masuk untuk melanjutkan." }) };
  }
}
