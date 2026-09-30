import type {
  ProjectAsset,
  VideoBriefRevision,
  VideoComposition,
  VideoMessage,
  VideoOutputKind,
  VideoProject,
  VideoRenderJob,
  VideoVersion,
} from "@/domain/video/types";
import { browserApiFetch, browserApiUpload } from "@/lib/api/browser-client";
import type { CreateVideoProjectInput } from "../schemas/video-project-schema";

type SignalOption = { signal?: AbortSignal };

function projectPath(projectId: string) {
  return `/video-projects/${encodeURIComponent(projectId)}`;
}

/** The bodies the backend accepts, all of them strict: nothing client-owned may ride along. */
export type StartRenderInput = {
  idempotencyKey: string;
  compositionRevisionId: string;
  kind: VideoOutputKind;
  parentVersionId?: string;
};

export const videoApi = {
  createProject(input: CreateVideoProjectInput, idempotencyKey: string, signal?: AbortSignal) {
    return browserApiFetch<{ project: VideoProject }>("/video-projects", { method: "POST", body: { ...input, idempotencyKey }, signal });
  },
  listProjects(signal?: AbortSignal) {
    return browserApiFetch<{ projects: VideoProject[] }>("/video-projects", { signal });
  },
  getProject(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ project: VideoProject }>(projectPath(projectId), { signal });
  },
  deleteProject(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ deleted: true }>(projectPath(projectId), { method: "DELETE", signal });
  },
  uploadAsset(projectId: string, body: BodyInit, contentType: string, signal?: AbortSignal) {
    return browserApiUpload<{ asset: ProjectAsset }>(`${projectPath(projectId)}/assets`, { body, contentType, signal });
  },
  listAssets(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ assets: ProjectAsset[] }>(`${projectPath(projectId)}/assets`, { signal });
  },
  deleteAsset(projectId: string, assetId: string, signal?: AbortSignal) {
    return browserApiFetch<{ deleted: true }>(`${projectPath(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: "DELETE", signal });
  },
  sendMessage(projectId: string, content: string, assetIds?: string[], signal?: AbortSignal) {
    return browserApiFetch<{ message: VideoMessage; reply: VideoMessage; project: VideoProject }>(`${projectPath(projectId)}/messages`, {
      method: "POST",
      body: { content, ...(assetIds === undefined ? {} : { assetIds }) },
      signal,
    });
  },
  openInterview(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ messages: VideoMessage[] }>(`${projectPath(projectId)}/messages/opening`, { method: "POST", signal });
  },
  listMessages(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ messages: VideoMessage[] }>(`${projectPath(projectId)}/messages`, { signal });
  },
  getBrief(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ brief: VideoBriefRevision | null }>(`${projectPath(projectId)}/brief`, { signal });
  },
  /** Planning and compiling are one call: it returns the revision the user is asked to approve. */
  createComposition(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ composition: { id: string; compositionHash: string; isFallback: boolean } }>(`${projectPath(projectId)}/compositions`, { method: "POST", signal });
  },
  listCompositions(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ compositions: VideoComposition[] }>(`${projectPath(projectId)}/compositions`, { signal });
  },
  getLatestComposition(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ composition: VideoComposition | null }>(`${projectPath(projectId)}/compositions/latest`, { signal });
  },
  startRender(projectId: string, input: StartRenderInput, signal?: AbortSignal) {
    return browserApiFetch<{ job: VideoRenderJob }>(`${projectPath(projectId)}/render-jobs`, { method: "POST", body: input, signal });
  },
  getLatestRenderJob(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ job: VideoRenderJob | null }>(`${projectPath(projectId)}/render-jobs/latest`, { signal });
  },
  async getRenderStatus(projectId: string, signal?: AbortSignal): Promise<{ job: VideoRenderJob | null; versions: VideoVersion[] }> {
    const [job, versions] = await Promise.all([videoApi.getLatestRenderJob(projectId, signal), videoApi.listVersions(projectId, signal)]);
    return { job: job.job, versions: versions.versions };
  },
  cancelRender(projectId: string, jobId: string, signal?: AbortSignal) {
    return browserApiFetch<{ job: VideoRenderJob }>(`${projectPath(projectId)}/render-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", signal });
  },
  listVersions(projectId: string, signal?: AbortSignal) {
    return browserApiFetch<{ versions: VideoVersion[] }>(`${projectPath(projectId)}/versions`, { signal });
  },
  async downloadVersion(projectId: string, versionId: string, signal?: AbortSignal): Promise<void> {
    const { url } = await browserApiFetch<{ url: string }>(`${projectPath(projectId)}/versions/${encodeURIComponent(versionId)}/download`, { signal });
    const downloadUrl = parseDownloadUrl(url);
    if (downloadUrl.protocol !== "https:" && !isDevelopmentLoopbackUrl(downloadUrl)) throw new Error("Invalid download URL.");
    window.location.href = downloadUrl.toString();
  },
  async loadVideoWorkspace(projectId: string, signal?: AbortSignal) {
    const options: SignalOption = { signal };
    const [project, assets, messages, brief, composition, renderJob, versions] = await Promise.all([
      videoApi.getProject(projectId, options.signal),
      videoApi.listAssets(projectId, options.signal),
      videoApi.listMessages(projectId, options.signal),
      videoApi.getBrief(projectId, options.signal),
      videoApi.getLatestComposition(projectId, options.signal),
      videoApi.getLatestRenderJob(projectId, options.signal),
      videoApi.listVersions(projectId, options.signal),
    ]);
    return {
      project: project.project,
      assets: assets.assets,
      messages: messages.messages,
      brief: brief.brief,
      composition: composition.composition,
      renderJob: renderJob.job,
      versions: versions.versions,
    };
  },
};

function parseDownloadUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error("Invalid download URL.");
  }
}

function isDevelopmentLoopbackUrl(url: URL) {
  const isDevelopmentOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  return isDevelopmentOrTest && url.protocol === "http:" && isLoopback;
}
