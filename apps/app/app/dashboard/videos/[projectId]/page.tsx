import Link from "next/link";
import { notFound } from "next/navigation";
import { VIDEO_STYLE_PRESETS, durationLabel, languageLabel, videoTypeLabel } from "@/domain/video/settings";
import type { ProjectAsset, VideoMessage, VideoProject } from "@/domain/video/types";
import { ProjectAssetGallery } from "@/features/video/components/ProjectAssetGallery";
import { ProjectStatusBadge } from "@/features/video/components/ProjectStatusBadge";
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

  try {
    const [projectResult, assetResult, messageResult] = await Promise.all([
      apiFetch<{ project: VideoProject }>(path),
      apiFetch<{ assets: ProjectAsset[] }>(`${path}/assets`),
      apiFetch<{ messages: VideoMessage[] }>(`${path}/messages`),
    ]);
    project = projectResult.project;
    assets = assetResult.assets;
    messages = messageResult.messages;
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
        <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-7">
          <h2 className="text-lg font-semibold text-white">Percakapan dan brief</h2>

          {messages.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-lg rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-black"
                      : "max-w-lg rounded-2xl border border-white/10 bg-pricing-bg px-4 py-3 text-sm leading-6 text-neutral-300"
                  }
                >
                  {message.content}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-neutral-450">Belum ada pesan pada proyek ini.</p>
          )}

          <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-black p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-primary">Menunggu backend</p>
            <p className="mt-2 text-sm leading-6 text-neutral-450">
              Balasan AI, brief, dan storyboard belum tersedia: API belum punya endpoint baca untuk brief atau storyboard,
              dan sebuah pesan hanya menyimpan sisi pengguna. Panel ini menampilkan keadaan sebenarnya.
            </p>
            <p className="mt-2 font-mono text-xs text-neutral-500">apps/app/docs/notes/video-backend-backlog.md</p>
          </div>
        </section>

        <aside className="space-y-6">
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
              <ProjectAssetGallery assets={assets} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
