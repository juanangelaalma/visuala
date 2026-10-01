"use client";

import { useEffect, useRef, useState } from "react";
import type { InterviewTurn, VideoMessage } from "@/domain/video/types";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function pendingTurn(messages: readonly VideoMessage[]): InterviewTurn | null {
  const last = messages.at(-1);
  return last?.role === "assistant" ? last.controls : null;
}

export type VideoChatSendOutcome =
  | { ok: true }
  | { ok: false; error: string; restoreDraft: boolean };

export function VideoChat({ messages, onSend, streaming, openingError = "", onRetryOpening, onReloadConversation, recoveryError = "", recovering = false }: {
  messages: VideoMessage[];
  onSend: (content: string, assetIds?: string[]) => Promise<VideoChatSendOutcome>;
  streaming: { text: string; outgoing: string; kind: "opening" | "send" } | null;
  openingError?: string;
  onRetryOpening?: () => Promise<void>;
  onReloadConversation: () => void;
  recoveryError?: string;
  recovering?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sendingRef = useRef(false);
  const [retryingOpening, setRetryingOpening] = useState(false);
  const retryingOpeningRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const activeTurn = pendingTurn(messages);
  const busy = pending || retryingOpening || streaming !== null || recovering;
  const blocked = busy || Boolean(openingError) || Boolean(recoveryError) || messages.length === 0;
  const displayedError = recoveryError || error;
  const status = recovering
    ? "Memuat percakapan…"
    : streaming?.kind === "opening" || retryingOpening || (messages.length === 0 && !openingError && !recoveryError)
      ? "AI sedang menyiapkan pertanyaan pertama…"
      : busy ? "AI sedang menyusun pertanyaan…" : "";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming?.text, streaming?.outgoing, pending, retryingOpening]);

  async function retryOpening() {
    if (retryingOpeningRef.current || sendingRef.current || busy || recovering || recoveryError || !onRetryOpening) return;
    retryingOpeningRef.current = true;
    setRetryingOpening(true);
    try {
      await onRetryOpening();
    } finally {
      retryingOpeningRef.current = false;
      setRetryingOpening(false);
    }
  }

  async function send(content = draft.trim()) {
    if (sendingRef.current || retryingOpeningRef.current || blocked) return;
    if (content.length === 0) {
      setError("Tulis pesan dulu.");
      return;
    }

    sendingRef.current = true;
    setError("");
    setDraft("");
    setPending(true);

    try {
      const outcome = await onSend(content, undefined);
      if (!outcome.ok) {
        if (outcome.restoreDraft) setDraft(content);
        setError(outcome.error);
      }
    } catch {
      setError("Koneksi terputus. Muat ulang percakapan sebelum mengirim lagi.");
    } finally {
      sendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className="flex min-h-[32rem] flex-col rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-7">
      <h2 className="text-lg font-semibold text-white">Percakapan</h2>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
        <div role="log" aria-label="Riwayat percakapan" className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <p
                className={
                  message.role === "user"
                    ? "min-w-0 max-w-lg whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-black"
                    : "min-w-0 max-w-lg whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-pricing-bg px-4 py-3 text-sm leading-6 text-neutral-200"
                }
              >
                {message.content}
              </p>
            </div>
          ))}
        </div>
        {streaming?.outgoing ? (
          <div className="flex justify-end">
            <p className="min-w-0 max-w-lg whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-black">{streaming.outgoing}</p>
          </div>
        ) : null}
        {streaming?.text ? (
          <div aria-label="Jawaban AI sementara" aria-busy="true" aria-live="off" className="flex justify-start">
            <p className="min-w-0 max-w-lg whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-pricing-bg px-4 py-3 text-sm leading-6 text-neutral-200">{streaming.text}</p>
          </div>
        ) : null}
        <p role="status" aria-live="polite" className={streaming?.text ? "sr-only" : "text-sm leading-6 text-neutral-450"}>{status}</p>
        <div ref={endRef} />
      </div>

      {activeTurn && !busy && activeTurn.options.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-semibold text-white">Pilihan jawaban</legend>
          <div className="space-y-2">
            {activeTurn.options.map((option) => {
              const isRecommended = option.id === activeTurn.recommendedOptionId;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => void send(option.label)}
                  className={`flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-pricing-bg px-4 py-3 text-left transition-colors hover:border-white/25 ${focusRing}`}
                >
                  <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded-full border border-neutral-500" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">
                      {option.label}
                      {isRecommended ? <small className="ml-2 font-mono text-[10px] uppercase text-primary">Rekomendasi</small> : null}
                    </span>
                    {option.detail ? <span className="mt-0.5 block text-xs leading-5 text-neutral-450">{option.detail}</span> : null}
                    {isRecommended && activeTurn.recommendationReason ? (
                      <span className="mt-1 block text-xs leading-5 text-neutral-450">Alasan: {activeTurn.recommendationReason}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {openingError && !recoveryError ? <div role="alert" className="mt-4 text-sm text-white"><p>{openingError}</p>{onRetryOpening ? <button type="button" disabled={busy} onClick={() => void retryOpening()} className={`mt-2 min-h-11 text-primary underline disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}>Coba mulai percakapan lagi</button> : null}</div> : null}

      {displayedError ? (
        <div role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
          <p>{displayedError}</p>
          {recoveryError ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                onReloadConversation();
              }}
              className={`mt-2 min-h-11 text-primary underline disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
            >
              Muat ulang percakapan
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <label htmlFor="video-chat-input" className="sr-only">
          Pesan Anda
        </label>
        <textarea
          id="video-chat-input"
          rows={2}
          value={draft}
          disabled={blocked}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tulis jawaban atau permintaan Anda…"
          className={`w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-primary ${focusRing}`}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[10px] text-neutral-500">AI hanya memakai fakta yang Anda konfirmasi.</p>
          <button
            type="button"
            onClick={() => void send()}
            disabled={blocked}
            className={`min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            {pending ? "Mengirim…" : "Kirim"}
          </button>
        </div>
      </div>
    </section>
  );
}
