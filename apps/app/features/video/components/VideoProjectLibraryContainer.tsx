"use client";

import { useEffect, useState } from "react";
import type { VideoProject } from "@/domain/video/types";
import { BrowserApiError, browserApiErrorMessage } from "@/lib/api/browser-client";
import { videoApi } from "../api/video-api";
import { VideoProjectLibrary } from "./VideoProjectLibrary";

export function VideoProjectLibraryContainer() {
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<VideoProject[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void videoApi.listProjects(controller.signal)
      .then(({ projects: loadedProjects }) => {
        if (!controller.signal.aborted) setProjects(loadedProjects);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [requestNumber]);

  if (isLoading) {
    return <p role="status" className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">Memuat proyek video...</p>;
  }

  if (projects) return <VideoProjectLibrary projects={projects} />;

  if (error instanceof BrowserApiError && error.status === 401) {
    return (
      <div role="alert" className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">
        <p>Sesi berakhir. Masuk lagi untuk melanjutkan.</p>
        <a href="/login" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">Masuk</a>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-neutral-300 shadow-card-inner">
      <p>{browserApiErrorMessage(error, "Daftar proyek tidak dapat dimuat. Coba lagi.")}</p>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIsLoading(true);
          setRequestNumber((current) => current + 1);
        }}
        className="mt-4 text-sm font-semibold text-primary underline underline-offset-4"
      >
        Coba lagi
      </button>
    </div>
  );
}
