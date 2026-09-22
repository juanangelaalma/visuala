import Link from "next/link";
import { notFound } from "next/navigation";
import { VIDEO_STYLE_PRESETS, durationLabel, languageLabel, videoTypeLabel } from "@/domain/video/settings";
import type { ProjectAsset, VideoBriefRevision, VideoMessage, VideoProject, VideoStoryboardRevision } from "@/domain/video/types";
import { ProjectAssetGallery } from "@/features/video/components/ProjectAssetGallery";
import { ProjectStatusBadge } from "@/features/video/components/ProjectStatusBadge";
import { RenderStatusPanel } from "@/features/video/components/RenderStatusPanel";
import { VideoApprovalPanel } from "@/features/video/components/VideoApprovalPanel";
import { VideoBriefPanel } from "@/features/video/components/VideoBriefPanel";
import { VideoChat } from "@/features/video/components/VideoChat";
import { VideoStoryboardPanel } from "@/features/video/components/VideoStoryboardPanel";
import { ApiError, apiFetch } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";

type VideoWorkspacePageProps = {
  params: Promise<{ projectId: string }>;
};

function styleLabel(project: VideoProject): string {
  return VIDEO_STYLE_PRESETS.find((preset) => preset.id === project.styleId)?.label ?? project.styleId;
}

export default async function VideoWorkspacePage({ params }: VideoWorkspacePageProps) {
  const { projectId } = await params;
  await requireUser();

  const path = `/video-projects/${encodeURIComponent(projectId)}`;
  let project: VideoProject;
  let assets: ProjectAsset[];
  let messages: VideoMessage[];
  let brief: VideoBriefRevision | null;
  let storyboard: VideoStoryboardRevision | null;

  try {
    const [projectResult, assetResult, messageResult, briefResult, storyboardResult] = await Promise.all([
      apiFetch<{ project: VideoProject }>(path),
      apiFetch<{ assets: ProjectAsset[] }>(`${path}/assets`),
      apiFetch<{ messages: VideoMessage[] }>(`${path}/messages`),
      apiFetch<{ brief: VideoBriefRevision | null }>(`${path}/brief`),
      apiFetch<{ storyboard: VideoStoryboardRevision | null }>(`${path}/storyboard`),
    ]);
    project = projectResult.project;
    assets = assetResult.assets;
    messages = messageResult.messages;
    brief = briefResult.brief;
    storyboard = storyboardResult.storyboard;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    console.error("Failed to load video project", error);

    return (
      <p className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">
        Proyek sedang tidak dapat dimuat. Coba lagi nanti.
      </p>
    );
  }

  const outputRows: [string, string][] = [
    ["Style", styleLabel(project)],
    ["Rasio", project.settings.aspectRatio],
    ["Durasi", durationLabel(project.settings.durationSeconds)],
    ["Resolusi", project.settings.resolution],
    ["Bahasa", languageLabel(project.settings.language)],
    ["Voice-over", project.settings.voiceOverEnabled ? "Aktif" : "Nonaktif"],
    ["Musik latar", project.settings.musicEnabled ? "Aktif" : "Nonaktif"],
  ];
  const approved = project.status === "approved" || Boolean(storyboard?.approvedAt);

  return (
    <div>
      <Link
        href="/dashboard/videos"
        className="mb-6 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-neutral-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        ‹ Semua proyek
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{videoTypeLabel(project.videoType)}</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-white">{project.title}</h1>
        </div>
        <ProjectStatusBadge status={project.status} />
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="space-y-6">
          <VideoChat projectId={project.id} messages={messages} />
          <VideoStoryboardPanel revision={storyboard} />
        </div>

        <aside className="space-y-6">
          <VideoApprovalPanel
            projectId={project.id}
            briefComplete={Boolean(brief?.isComplete)}
            hasStoryboard={storyboard !== null}
            approved={approved}
          />
          <VideoBriefPanel revision={brief} />

          <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
            <h2 className="text-base font-semibold text-white">Output</h2>
            <dl className="mt-4 space-y-3 text-sm">
              {outputRows.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4">
                  <dt className="text-neutral-450">{key}</dt>
                  <dd className={`text-right font-mono text-xs font-semibold ${key === "Style" ? "text-primary" : "text-white"}`}>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-neutral-500">Revisi terpakai {project.revisionRenderCount}/3</p>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
            <h2 className="text-base font-semibold text-white">
              Foto produk <span className="float-right font-mono text-xs text-neutral-500">{assets.length} foto</span>
            </h2>
            <div className="mt-4">
              <ProjectAssetGallery projectId={project.id} assets={assets} />
            </div>
          </section>

          <RenderStatusPanel />
        </aside>
      </div>
    </div>
  );
}
