"use client";

import { Button } from "@visuala/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { VIDEO_STYLE_PRESETS, durationLabel, videoTypeLabel } from "@/domain/video/settings";
import type { VideoProject } from "@/domain/video/types";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type VideoProjectLibraryProps = {
  projects: VideoProject[];
};

/**
 * The backend has no project thumbnail endpoint, so the tile background is derived from the chosen
 * style preset instead of an image. See apps/app/docs/notes/video-backend-backlog.md.
 */
function tileBackground(styleId: VideoProject["styleId"]): string {
  const preset = VIDEO_STYLE_PRESETS.find((candidate) => candidate.id === styleId);
  const [from, to] = preset?.swatch ?? ["#333333", "#111111"];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/** UTC formatting keeps the server and client render identical, so the date never triggers a hydration mismatch. */
function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function ProjectCard({ project }: { project: VideoProject }) {
  return (
    <Link
      href={`/dashboard/videos/${encodeURIComponent(project.id)}`}
      className={`group flex flex-col rounded-3xl border border-white/10 bg-pricing-bg p-3 shadow-card-inner transition-colors hover:border-white/25 ${focusRing}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl" style={{ backgroundImage: tileBackground(project.styleId) }}>
        <span className="absolute left-3 top-3">
          <ProjectStatusBadge status={project.status} />
        </span>
      </div>
      <div className="px-2 pb-1 pt-4">
        <h3 className="truncate text-base font-semibold text-white">{project.title}</h3>
        <p className="mt-1 text-sm text-neutral-450">{videoTypeLabel(project.videoType)}</p>
        <p className="mt-3 font-mono text-xs text-neutral-500">
          {project.settings.aspectRatio} • {durationLabel(project.settings.durationSeconds)} • {project.settings.resolution}
        </p>
        <p className="mt-1 font-mono text-xs text-neutral-650">Diperbarui {formatUpdatedAt(project.updatedAt)}</p>
      </div>
    </Link>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-pricing-bg p-5 shadow-card-inner">
      <strong className="font-mono text-2xl tabular-nums text-white">{value}</strong>
      <p className="mt-1 text-xs text-neutral-450">{label}</p>
    </article>
  );
}

export function VideoProjectLibrary({ projects }: VideoProjectLibraryProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(needle));
  }, [projects, query]);

  const readyCount = projects.filter((project) => project.status === "ready").length;
  const renderingCount = projects.filter((project) => project.status === "rendering").length;

  return (
    <section>
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Ruang kerja video</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-white">Proyek video</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-450">Lanjutkan brief, pantau render, atau unduh versi yang sudah siap.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div role="search" className="flex min-h-11 items-center rounded-2xl border border-white/10 bg-pricing-bg px-4 text-neutral-450 focus-within:border-primary">
            <span aria-hidden="true">⌕</span>
            <label htmlFor="video-project-search" className="sr-only">
              Cari proyek
            </label>
            <input
              id="video-project-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari proyek"
              className="ml-2 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
            />
          </div>
          <Button href="/dashboard/videos/new" variant="primary" tone="dark" className="h-11 shrink-0 px-5 py-0 text-sm font-semibold">
            Buat video
          </Button>
        </div>
      </header>

      {projects.length > 0 ? (
        <section aria-label="Ringkasan proyek" className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat value={projects.length} label="Total proyek" />
          <Stat value={readyCount} label="Siap diunduh" />
          <Stat value={renderingCount} label="Sedang dirender" />
        </section>
      ) : null}

      <div className="mt-6">
        {projects.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-pricing-bg p-10 text-center shadow-card-inner">
            <h2 className="text-lg font-semibold text-white">Belum ada proyek video</h2>
            <p className="mt-2 text-sm text-neutral-450">Mulai dengan memilih tipe video, durasi, dan rasio yang Anda butuhkan.</p>
            <Button href="/dashboard/videos/new" variant="primary" tone="dark" className="mt-6 h-11 px-5 py-0 text-sm font-semibold">
              Buat video
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div role="status" className="rounded-3xl border border-dashed border-white/15 bg-pricing-bg p-10 text-center shadow-card-inner">
            <h2 className="text-lg font-semibold text-white">Proyek tidak ditemukan</h2>
            <p className="mt-2 text-sm text-neutral-450">Coba kata lain atau hapus pencarian.</p>
            <button type="button" onClick={() => setQuery("")} className={`mt-4 text-sm font-semibold text-primary underline underline-offset-4 ${focusRing}`}>
              Hapus pencarian
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
