"use client";

import { useEffect, useRef, useState } from "react";
import type { InterviewTurn, VideoMessage } from "@/domain/video/types";
import { browserApiErrorMessage } from "@/lib/api/browser-client";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function pendingTurn(messages: readonly VideoMessage[]): InterviewTurn | null {
  const last = messages.at(-1);
  return last?.role === "assistant" ? last.controls : null;
}

/**
 * Sent imperatively rather than through `useActionState`, because a successful turn has to clear the
 * composer and the form-action pattern cannot do that without a state-in-effect.
 */
export function VideoChat({ messages, onSend, openingError = "", onRetryOpening }: {
  messages: VideoMessage[];
  onSend: (content: string, assetIds?: string[]) => Promise<unknown>;
  openingError?: string;
  onRetryOpening?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [outgoing, setOutgoing] = useState("");
  const [confirmed, setConfirmed] = useState<VideoMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const visibleMessages = [...messages, ...confirmed.filter((entry) => !messages.some((message) => message.id === entry.id))];
  const lastMessage = visibleMessages.at(-1);
  const activeTurn = lastMessage?.role === "assistant" ? pendingTurn(visibleMessages) : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, confirmed.length, outgoing, pending]);

  async function send(content = draft.trim()) {
    if (pending || openingError) return;
    if (content.length === 0) {
      setError("Tulis pesan dulu.");
      return;
    }

    setError("");
    setDraft("");
    setOutgoing(content);
    setPending(true);

    try {
      const result = await onSend(content, undefined);
      if (result && typeof result === "object" && "message" in result && "reply" in result) {
        const turnResult = result as { message: VideoMessage; reply: VideoMessage };
        setConfirmed((current) => [...current, turnResult.message, turnResult.reply]);
      }
    } catch (requestError) {
      setDraft(content);
      setError(browserApiErrorMessage(requestError, "Pesan tidak dapat dikirim. Coba lagi."));
    } finally {
      setOutgoing("");
      setPending(false);
    }
  }

  return (
    <section className="flex min-h-[32rem] flex-col rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-7">
      <h2 className="text-lg font-semibold text-white">Percakapan</h2>

      <div role="log" aria-label="Riwayat percakapan" className="mt-4 flex-1 space-y-3 overflow-y-auto">
        {visibleMessages.length === 0 && !outgoing ? (
          <p role="status" className="text-sm leading-6 text-neutral-450">{openingError ? "AI belum dapat memulai percakapan." : "AI sedang menyiapkan pertanyaan pertama…"}</p>
        ) : (
          visibleMessages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <p
                className={
                  message.role === "user"
                    ? "max-w-lg rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-black"
                    : "max-w-lg rounded-2xl border border-white/10 bg-pricing-bg px-4 py-3 text-sm leading-6 text-neutral-200"
                }
              >
                {message.content}
              </p>
            </div>
          ))
        )}
        {outgoing ? <div className="video-chat-message-enter flex justify-end"><p className="max-w-lg rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-black">{outgoing}</p></div> : null}
        {pending ? (
          <p role="status" aria-live="polite" className="text-sm text-neutral-450">
            AI sedang menyusun pertanyaan…
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {activeTurn && !pending && !outgoing && activeTurn.options.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-semibold text-white">Pilihan jawaban</legend>
          <div className="space-y-2">
            {activeTurn.options.map((option) => {
              const isRecommended = option.id === activeTurn.recommendedOptionId;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={pending}
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

      {openingError ? <div role="alert" className="mt-4 text-sm text-white"><p>{openingError}</p><button type="button" onClick={() => void onRetryOpening?.()} className={`mt-2 text-primary underline ${focusRing}`}>Coba mulai percakapan lagi</button></div> : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <label htmlFor="video-chat-input" className="sr-only">
          Pesan Anda
        </label>
        <textarea
          id="video-chat-input"
          rows={2}
          value={draft}
          disabled={pending || Boolean(openingError) || messages.length === 0}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tulis jawaban atau permintaan Anda…"
          className={`w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-primary ${focusRing}`}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[10px] text-neutral-500">AI hanya memakai fakta yang Anda konfirmasi.</p>
          <button
            type="button"
            onClick={() => void send()}
            disabled={pending || Boolean(openingError) || messages.length === 0}
            className={`min-h-10 rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            {pending ? "Mengirim…" : "Kirim"}
          </button>
        </div>
      </div>
    </section>
  );
}
