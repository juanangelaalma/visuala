"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

const VIDEO_DURATIONS = [15, 30, 60] as const;
const SUGGESTIONS = ["Iklan jasa", "Profil usaha", "Cerita brand", "Demo cara pakai", "Testimoni pelanggan"] as const;

export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export type VideoPromptSubmission = {
  prompt: string;
  durationSeconds: VideoDuration;
  files: File[];
};

export type VideoPromptBarProps = {
  onSubmit?: (submission: VideoPromptSubmission) => void;
};

export function createVideoPromptSubmission(submission: VideoPromptSubmission): VideoPromptSubmission {
  return { ...submission, prompt: submission.prompt.trim() };
}

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function VideoPromptBar({ onSubmit }: VideoPromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<VideoDuration>(60);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = prompt.trim().length > 0;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 136)}px`;
  }, [prompt]);

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit?.(createVideoPromptSubmission({ prompt, durationSeconds, files }));
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function addFiles(selectedFiles: FileList | null) {
    if (!selectedFiles?.length) return;
    setFiles((currentFiles) => [...currentFiles, ...Array.from(selectedFiles)]);
  }

  function applySuggestion(suggestion: string) {
    setPrompt(suggestion);
    textareaRef.current?.focus();
  }

  return (
    <div className="w-full max-w-[900px]">
      <form onSubmit={submitPrompt} className="relative overflow-visible rounded-3xl border border-white/15 bg-[#202236] shadow-[0_22px_70px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors focus-within:border-primary/55 motion-reduce:transition-none">
        <div className="flex min-h-38 flex-col px-5 py-4 sm:px-6 sm:py-5">
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            aria-label="Describe your video"
            placeholder="Ceritakan video yang ingin kamu buat..."
            className="min-h-18 max-h-34 w-full resize-none overflow-y-auto bg-transparent font-sans-secondary text-base font-medium leading-6 text-white outline-none placeholder:text-neutral-450 sm:min-h-20"
          />

          {files.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2" aria-label="Attached files">
              {files.map((file, index) => (
                <span key={`${file.name}-${file.lastModified}-${index}`} className="flex h-8 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pr-1 pl-3 text-xs text-neutral-450">
                  <span className="max-w-44 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index))}
                    className="flex size-6 items-center justify-center rounded-full text-neutral-450 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none"
                  >
                    <Icon size={12}><path d="m7 7 10 10M17 7 7 17" /></Icon>
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                tabIndex={-1}
                aria-hidden="true"
                multiple
                accept="image/*,video/*,.pdf"
                className="sr-only"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Attach files"
                onClick={() => fileInputRef.current?.click()}
                className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/4 text-neutral-450 transition-[border-color,background-color,color,transform] hover:border-white/25 hover:bg-white/8 hover:text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
              >
                <Icon><path d="M12 5v14M5 12h14" /></Icon>
              </button>

              <label className="relative flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/4 px-3.5 font-sans-secondary text-sm text-neutral-450 transition-[border-color,background-color,color] hover:border-white/25 hover:bg-white/8 hover:text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary motion-reduce:transition-none">
                <Icon size={15}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
                <select
                  aria-label="Choose video duration"
                  value={durationSeconds}
                  onChange={(event) => setDurationSeconds(Number(event.target.value) as VideoDuration)}
                  className="cursor-pointer appearance-none bg-transparent pr-5 text-sm text-current outline-none"
                >
                  {VIDEO_DURATIONS.map((duration) => <option key={duration} value={duration} className="bg-[#292b40] text-white">{duration} detik</option>)}
                </select>
                <span className="pointer-events-none absolute right-3 text-neutral-450"><Icon size={13}><path d="m8 10 4 4 4-4" /></Icon></span>
              </label>
            </div>

            <button
              type="submit"
              aria-label="Create video"
              disabled={!canSubmit}
              className="flex size-11 items-center justify-center rounded-full bg-primary text-black transition-[background-color,transform,opacity] enabled:hover:bg-primary-dark enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <Icon size={19}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>
            </button>
          </div>
        </div>
      </form>

      <p role="status" aria-live="polite" className="sr-only">{files.length > 0 ? `${files.length} file attached` : "No files attached"}</p>

      <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Prompt suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => applySuggestion(suggestion)}
            className="min-h-9 rounded-full border border-white/12 bg-transparent px-4 font-sans-secondary text-xs font-medium text-neutral-450 transition-[border-color,background-color,color,transform] hover:border-white/25 hover:bg-white/5 hover:text-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
