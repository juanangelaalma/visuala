"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { VIDEO_STYLE_PRESETS, durationLabel, languageLabel, videoTypeLabel } from "@/domain/video/settings";
import { BrowserApiError, browserApiErrorMessage } from "@/lib/api/browser-client";
import { videoApi } from "../api/video-api";
import { ProjectAssetGallery } from "./ProjectAssetGallery";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { RenderStatusPanel } from "./RenderStatusPanel";
import { VideoApprovalPanel } from "./VideoApprovalPanel";
import { VideoBriefPanel } from "./VideoBriefPanel";
import { VideoChat } from "./VideoChat";
import { VideoStoryboardPanel } from "./VideoStoryboardPanel";
import { VideoVersionList } from "./VideoVersionList";

type Workspace = Awaited<ReturnType<typeof videoApi.loadVideoWorkspace>>;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function styleLabel(project: Workspace["project"]): string {
  return VIDEO_STYLE_PRESETS.find((preset) => preset.id === project.styleId)?.label ?? project.styleId;
}

export function VideoWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestNumber, setRequestNumber] = useState(0);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const generation = useRef(0);

  const reload = useCallback(() => {
    setRequestNumber((current) => current + 1);
  }, []);

  const applyPolledVersions = useCallback((nextVersions: Workspace["versions"]) => {
    setWorkspace((current) => (current ? { ...current, versions: nextVersions } : current));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = ++generation.current;
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setIsLoading(true);
      setError(null);
      setWorkspace(null);
      void videoApi.loadVideoWorkspace(projectId, controller.signal)
        .then((loadedWorkspace) => {
          if (!controller.signal.aborted && requestGeneration === generation.current) setWorkspace(loadedWorkspace);
        })
        .catch((requestError: unknown) => {
          if (!controller.signal.aborted && requestGeneration === generation.current) setError(requestError);
        })
        .finally(() => {
          if (!controller.signal.aborted && requestGeneration === generation.current) setIsLoading(false);
        });
    });

    return () => controller.abort();
  }, [projectId, requestNumber]);

  if (isLoading) {
    return <p role="status" className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">Memuat proyek video...</p>;
  }

  if (error instanceof BrowserApiError && error.status === 404) {
    return <p role="alert" className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">Proyek tidak ditemukan.</p>;
  }

  if (error instanceof BrowserApiError && error.status === 401) {
    return (
      <div role="alert" className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">
        <p>Sesi berakhir. Masuk lagi untuk melanjutkan.</p>
        <a href="/login" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">Masuk</a>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div role="alert" className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">
        <p>{browserApiErrorMessage(error, "Proyek tidak dapat dimuat. Coba lagi.")}</p>
        <button type="button" onClick={reload} className="mt-4 text-sm font-semibold text-primary underline underline-offset-4">Coba lagi</button>
      </div>
    );
  }

  const { project, assets, messages, brief, storyboard, renderJobs, versions } = workspace;
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

  async function removeProject() {
    setDeleteError("");
    setDeleting(true);

    try {
      await videoApi.deleteProject(project.id);
      router.push("/dashboard/videos");
    } catch (requestError) {
      setDeleteError(browserApiErrorMessage(requestError, "Proyek tidak dapat dihapus. Coba lagi."));
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link href="/dashboard/videos" className="mb-6 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-neutral-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
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
          <VideoChat messages={messages} onSend={async (content, assetIds) => { await videoApi.sendMessage(project.id, content, assetIds); reload(); }} />
          <VideoStoryboardPanel revision={storyboard} />
        </div>

        <aside className="space-y-6">
          <VideoApprovalPanel projectId={project.id} briefComplete={Boolean(brief?.isComplete)} hasStoryboard={storyboard !== null} approved={approved} onApprove={async () => { await videoApi.approveProject(project.id); reload(); }} />
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
            <h2 className="text-base font-semibold text-white">Foto produk <span className="float-right font-mono text-xs text-neutral-500">{assets.length} foto</span></h2>
            <div className="mt-4">
              <ProjectAssetGallery assets={assets} onDeleteAsset={async (assetId) => {
                await videoApi.deleteAsset(project.id, assetId);
                setWorkspace((current) => current ? { ...current, assets: current.assets.filter((asset) => asset.id !== assetId) } : current);
              }} />
            </div>
          </section>

          <RenderStatusPanel key={renderJobs[0]?.id ?? "no-render"} projectId={project.id} initialJob={renderJobs[0] ?? null} canRender={project.status === "approved"} quotaExhausted={project.revisionRenderCount >= 3} onVersionsChange={applyPolledVersions} />
          <VideoVersionList projectId={project.id} versions={versions} onDownloadVersion={(versionId) => videoApi.downloadVersion(project.id, versionId)} />

          <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
            <h2 className="text-base font-semibold text-white">Hapus proyek</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-450">Brief, foto, dan seluruh hasil render proyek ini ikut terhapus dan tidak bisa dikembalikan.</p>

            {deleteError ? (
              <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
                {deleteError}
              </p>
            ) : null}

            {deleteConfirmation ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void removeProject()}
                  disabled={deleting}
                  aria-disabled={deleting}
                  className={`h-11 flex-1 rounded-full bg-danger px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  {deleting ? "Menghapus…" : "Ya, hapus"}
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmation(false); setDeleteError(""); }}
                  disabled={deleting}
                  aria-disabled={deleting}
                  className={`h-11 flex-1 rounded-full bg-white/10 px-5 text-sm font-semibold text-neutral-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirmation(true)}
                className={`mt-4 h-11 w-full rounded-full border border-danger/40 bg-danger/10 px-5 text-sm font-semibold text-white hover:bg-danger/20 ${focusRing}`}
              >
                Hapus proyek
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
