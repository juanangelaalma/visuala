"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoMessage } from "@/domain/video/types";
import { VIDEO_STYLE_PRESETS, durationLabel, languageLabel, videoTypeLabel } from "@/domain/video/settings";
import { BrowserApiError, browserApiErrorMessage } from "@/lib/api/browser-client";
import { videoApi, type VideoWorkspaceData } from "../api/video-api";
import { ProjectAssetGallery } from "./ProjectAssetGallery";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { RenderStatusPanel } from "./RenderStatusPanel";
import { VideoBriefPanel } from "./VideoBriefPanel";
import { VideoChat, type VideoChatSendOutcome } from "./VideoChat";
import { VideoCompositionPanel } from "./VideoCompositionPanel";
import { VideoVersionList } from "./VideoVersionList";

type Workspace = VideoWorkspaceData;

type Conversation = {
  kind: "opening" | "send";
  text: string;
  outgoing: string;
  userPersisted: boolean;
};
type ActiveConversation = {
  id: number;
  projectId: string;
  controller: AbortController;
  revision: number;
  kind: Conversation["kind"];
  userPersisted: boolean;
};
type WorkspaceRead = {
  generation: number;
  revision: number;
  projectId: string;
  controller: AbortController;
};

const disconnectedMessage = "Koneksi terputus. Muat ulang percakapan sebelum mengirim lagi.";

function mergeMessages(current: VideoMessage[], incoming: VideoMessage[]): VideoMessage[] {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) merged.set(message.id, message);
  return [...merged.values()];
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function styleLabel(project: Workspace["project"]): string {
  return VIDEO_STYLE_PRESETS.find((preset) => preset.id === project.styleId)?.label ?? project.styleId;
}

export function VideoWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streaming, setStreaming] = useState<Conversation | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [openingError, setOpeningError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const currentProjectId = useRef(projectId);
  currentProjectId.current = projectId;
  const readGeneration = useRef(0);
  const conversationRevision = useRef(0);
  const conversationIdentity = useRef(0);
  const activeConversation = useRef<ActiveConversation | null>(null);
  const activeRead = useRef<WorkspaceRead | null>(null);
  const recoveryBlocked = useRef(false);
  const openingAttempted = useRef<string | null>(null);

  const cancelRead = useCallback(() => {
    activeRead.current?.controller.abort();
    activeRead.current = null;
    readGeneration.current += 1;
  }, []);

  const isCurrentConversation = useCallback((request: ActiveConversation) =>
    activeConversation.current?.id === request.id
    && currentProjectId.current === request.projectId
    && conversationRevision.current === request.revision
    && !request.controller.signal.aborted, []);

  const readWorkspace = useCallback(async (targetProjectId: string, reconciliation = false) => {
    cancelRead();
    const request: WorkspaceRead = {
      generation: readGeneration.current,
      revision: conversationRevision.current,
      projectId: targetProjectId,
      controller: new AbortController(),
    };
    activeRead.current = request;
    const isCurrent = () => !request.controller.signal.aborted
      && readGeneration.current === request.generation
      && conversationRevision.current === request.revision
      && currentProjectId.current === request.projectId;

    try {
      const loaded = await videoApi.loadVideoWorkspace(targetProjectId, request.controller.signal);
      if (!isCurrent()) return "stale" as const;
      setWorkspace((current) => {
        if (!isCurrent()) return current;
        return {
          ...loaded,
          messages: mergeMessages(
            current?.project.id === targetProjectId ? current.messages : [],
            loaded.messages,
          ),
        };
      });
      if (loaded.messages.length > 0) setOpeningError("");
      setError(null);
      setIsLoading(false);
      return "loaded" as const;
    } catch (requestError) {
      if (!isCurrent()) return "stale" as const;
      if (!reconciliation) setError(requestError);
      setIsLoading(false);
      return "failed" as const;
    } finally {
      if (isCurrent() && activeRead.current === request) activeRead.current = null;
    }
  }, [cancelRead]);

  const reload = useCallback(() => {
    // Every terminal path refreshes once, covering reloads requested during a turn.
    if (activeConversation.current) return;
    const targetProjectId = currentProjectId.current;
    const revision = conversationRevision.current;
    const reconciling = recoveryBlocked.current;
    if (reconciling) setRecovering(true);
    void readWorkspace(targetProjectId, reconciling).then((result) => {
      if (result === "stale" || currentProjectId.current !== targetProjectId || conversationRevision.current !== revision) return;
      if (reconciling) {
        if (result === "loaded") {
          recoveryBlocked.current = false;
          setRecoveryError("");
        }
        setRecovering(false);
      }
    });
  }, [readWorkspace]);

  const beginConversation = useCallback((kind: Conversation["kind"], outgoing = "") => {
    if (currentProjectId.current !== projectId || activeConversation.current || recoveryBlocked.current) return null;
    cancelRead();
    const request: ActiveConversation = {
      id: ++conversationIdentity.current,
      projectId,
      controller: new AbortController(),
      revision: ++conversationRevision.current,
      kind,
      userPersisted: false,
    };
    activeConversation.current = request;
    setStreaming({ kind, outgoing, text: "", userPersisted: false });
    setOpeningError("");
    setRecoveryError("");
    return request;
  }, [cancelRead, projectId]);

  const publishText = useCallback((request: ActiveConversation, delta: string) => {
    console.log(request, delta)
    if (!isCurrentConversation(request)) return;
    setStreaming((current) => isCurrentConversation(request) && current
      ? { ...current, text: current.text + delta }
      : current);
  }, [isCurrentConversation]);

  const reconcileFailure = useCallback(async (request: ActiveConversation, failure: unknown): Promise<VideoChatSendOutcome> => {
    const restoreDraft = failure instanceof BrowserApiError && !failure.streamed && !request.userPersisted;
    const fallback = request.kind === "opening"
      ? "AI belum dapat memulai percakapan. Coba lagi."
      : "Pesan tidak dapat dikirim. Coba lagi.";
    const message = restoreDraft
      ? browserApiErrorMessage(failure, fallback)
      : failure instanceof BrowserApiError
        ? `${browserApiErrorMessage(failure, fallback)} ${request.kind === "send" ? "Jawaban Anda" : "Percakapan"} mungkin sudah tersimpan.`
        : disconnectedMessage;
    if (!isCurrentConversation(request)) return { ok: false, error: "", restoreDraft: false };
    setStreaming(null);
    if (request.kind === "opening") setOpeningError(message);
    recoveryBlocked.current = true;
    setRecoveryError(restoreDraft ? "" : message);
    setRecovering(true);
    const result = await readWorkspace(request.projectId, true);
    if (!isCurrentConversation(request)) return { ok: false, error: "", restoreDraft: false };
    if (result === "loaded") {
      recoveryBlocked.current = false;
      setRecoveryError("");
    } else {
      setRecoveryError(restoreDraft
        ? "Percakapan belum dapat dimuat. Muat ulang percakapan sebelum mengirim lagi."
        : message);
    }
    setRecovering(false);
    return { ok: false, error: message, restoreDraft };
  }, [isCurrentConversation, readWorkspace]);

  const openConversation = useCallback(async () => {
    const request = beginConversation("opening");
    if (!request) return;
    openingAttempted.current = request.projectId;
    let failed = false;
    try {
      const opened = await videoApi.openInterview(request.projectId, {
        signal: request.controller.signal,
        onTextDelta: (delta) => publishText(request, delta),
      });
      console.log(opened)
      if (!isCurrentConversation(request)) return;
      setWorkspace((current) => current?.project.id === request.projectId
        && conversationRevision.current === request.revision
        && currentProjectId.current === request.projectId
        && !request.controller.signal.aborted
        ? { ...current, messages: mergeMessages([], opened.messages) }
        : current);
      setStreaming(null);
      setOpeningError("");
    } catch (openingFailure) {
      if (!isCurrentConversation(request)) return;
      failed = true;
      await reconcileFailure(request, openingFailure);
    } finally {
      if (isCurrentConversation(request)) {
        activeConversation.current = null;
        if (!failed) void readWorkspace(request.projectId);
      }
    }
  }, [beginConversation, isCurrentConversation, publishText, readWorkspace, reconcileFailure]);

  const sendMessage = useCallback(async (content: string, assetIds?: string[]): Promise<VideoChatSendOutcome> => {
    const request = beginConversation("send", content);
    if (!request) return { ok: false, error: "Percakapan masih diproses.", restoreDraft: false };
    let failed = false;
    try {
      const result = await videoApi.sendMessage(request.projectId, content, assetIds, {
        signal: request.controller.signal,
        onTextDelta: (delta) => publishText(request, delta),
        onMessagePersisted: ({ message, project }) => {
          if (!isCurrentConversation(request)) return;
          request.userPersisted = true;
          setWorkspace((current) => current?.project.id === request.projectId
            && conversationRevision.current === request.revision
            && currentProjectId.current === request.projectId
            && !request.controller.signal.aborted
            ? { ...current, project, messages: mergeMessages(current.messages, [message]) }
            : current);
          setStreaming((current) => isCurrentConversation(request) && current
            ? { ...current, outgoing: "", userPersisted: true }
            : current);
        },
      });
      if (!isCurrentConversation(request)) return { ok: false, error: "", restoreDraft: false };
      setWorkspace((current) => current?.project.id === request.projectId
        && conversationRevision.current === request.revision
        && currentProjectId.current === request.projectId
        && !request.controller.signal.aborted
        ? { ...current, project: result.project, messages: mergeMessages(current.messages, [result.message, result.reply]) }
        : current);
      setStreaming(null);
      return { ok: true };
    } catch (sendFailure) {
      if (!isCurrentConversation(request)) return { ok: false, error: "", restoreDraft: false };
      failed = true;
      return await reconcileFailure(request, sendFailure);
    } finally {
      if (isCurrentConversation(request)) {
        activeConversation.current = null;
        if (!failed) void readWorkspace(request.projectId);
      }
    }
  }, [beginConversation, isCurrentConversation, publishText, readWorkspace, reconcileFailure]);

  const applyPolledVersions = useCallback((nextVersions: Workspace["versions"]) => {
    if (currentProjectId.current !== projectId) return;
    setWorkspace((current) => current?.project.id === projectId ? { ...current, versions: nextVersions } : current);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    openingAttempted.current = null;
    recoveryBlocked.current = false;
    queueMicrotask(() => {
      if (cancelled || currentProjectId.current !== projectId) return;
      setIsLoading(true);
      setWorkspace(null);
      setStreaming(null);
      setError(null);
      setOpeningError("");
      setRecoveryError("");
      setRecovering(false);
      setDeleteConfirmation(false);
      setDeleteError("");
      setDeleting(false);
      setPreviewing(false);
      setApproving(false);
      void readWorkspace(projectId);
    });
    return () => {
      cancelled = true;
      activeConversation.current?.controller.abort();
      activeConversation.current = null;
      conversationIdentity.current += 1;
      conversationRevision.current += 1;
      cancelRead();
    };
  }, [cancelRead, projectId, readWorkspace]);

  useEffect(() => {
    if (isLoading || workspace?.project.id !== projectId || workspace.messages.length > 0
      || !["draft", "interviewing"].includes(workspace.project.status)
      || openingAttempted.current === projectId || recoveryBlocked.current) return;
    void openConversation();
  }, [isLoading, openConversation, projectId, workspace]);

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

  const { project, assets, messages, brief, composition, renderJob, versions } = workspace;
  const outputRows: [string, string][] = [
    ["Style", styleLabel(project)],
    ["Rasio", project.settings.aspectRatio],
    ["Durasi", durationLabel(project.settings.durationSeconds)],
    ["Resolusi", project.settings.resolution],
    ["Bahasa", languageLabel(project.settings.language)],
    ["Voice-over", project.settings.voiceOverEnabled ? "Aktif" : "Nonaktif"],
    ["Musik latar", project.settings.musicEnabled ? "Aktif" : "Nonaktif"],
  ];

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

  async function plan(mode: "preview" | "approve") {
    if (mode === "preview") {
      setPreviewing(true);
      try {
        const { composition } = await videoApi.createComposition(project.id);
        // A plan is only watchable once its frozen artifact has rendered, and approval stays closed until then.
        await videoApi.startRender(project.id, {
          idempotencyKey: crypto.randomUUID(),
          compositionRevisionId: composition.id,
          kind: "preview",
        });
        reload();
      } finally {
        setPreviewing(false);
      }
      return;
    }

    if (!composition) return;
    setApproving(true);
    try {
      await videoApi.startRender(project.id, {
        idempotencyKey: crypto.randomUUID(),
        compositionRevisionId: composition.id,
        kind: "final",
        // A rerender of a previous export is what the revision quota counts.
        ...(versions[0] ? { parentVersionId: versions[0].id } : {}),
      });
      reload();
    } finally {
      setApproving(false);
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

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-6">
          <VideoChat
            key={project.id}
            messages={messages}
            streaming={streaming}
            openingError={openingError}
            onRetryOpening={openConversation}
            onSend={sendMessage}
            recoveryError={recoveryError}
            recovering={recovering}
            onReloadConversation={reload}
          />

        </div>

        <aside className="space-y-6">
          <VideoCompositionPanel
            composition={composition}
            briefComplete={Boolean(brief?.isComplete)}
            previewing={previewing}
            approving={approving}
            onPlan={plan}
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
            <h2 className="text-base font-semibold text-white">Foto produk <span className="float-right font-mono text-xs text-neutral-500">{assets.length} foto</span></h2>
            <div className="mt-4">
              <ProjectAssetGallery assets={assets} onDeleteAsset={async (assetId) => {
                await videoApi.deleteAsset(project.id, assetId);
                setWorkspace((current) => current ? { ...current, assets: current.assets.filter((asset) => asset.id !== assetId) } : current);
              }} />
            </div>
          </section>

          <RenderStatusPanel key={renderJob?.id ?? "no-render"} projectId={project.id} initialJob={renderJob} onVersionsChange={applyPolledVersions} onSettled={reload} />
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
