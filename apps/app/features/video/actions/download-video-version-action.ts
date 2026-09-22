"use server";

import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

/**
 * Mints a short-lived download URL through the existing endpoint and redirects to it, so the signed
 * URL never appears in the rendered markup. A version whose object is gone answers 404 and the user
 * stays on the page instead of landing on an error.
 */
export async function downloadVideoVersionAction(formData: FormData): Promise<void> {
  await requireUser();

  const projectId = formData.get("projectId");
  const versionId = formData.get("versionId");
  if (typeof projectId !== "string" || typeof versionId !== "string") return;

  let url: string;
  try {
    ({ url } = await apiFetch<{ url: string }>(`/video-projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/download`));
  } catch (error) {
    if (error instanceof ApiError) return;
    throw error;
  }

  redirect(url);
}
