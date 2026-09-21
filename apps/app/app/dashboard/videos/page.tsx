import type { VideoProject } from "@/domain/video/types";
import { VideoProjectLibrary } from "@/features/video/components/VideoProjectLibrary";
import { apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Proyek video" };

export default async function VideoProjectsPage() {
  await requireUser();

  let projects: VideoProject[];
  try {
    const result = await apiFetch<{ projects: VideoProject[] }>("/video-projects");
    projects = result.projects;
  } catch (error) {
    console.error("Failed to load video projects", error);

    return (
      <p className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">
        Daftar proyek sedang tidak tersedia. Coba lagi nanti.
      </p>
    );
  }

  return <VideoProjectLibrary projects={projects} />;
}
