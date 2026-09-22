"use client";

import { useEffect, useRef, useState } from "react";
import type { InterviewOption, InterviewTurn, VideoMessage } from "@/domain/video/types";
import { sendVideoMessageAction } from "../actions/send-video-message-action";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** The newest assistant turn still waiting for an answer, if it asked a question. */
function pendingTurn(messages: readonly VideoMessage[]): InterviewTurn | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message.controls;
  }
  return null;
}

/**
 * Sent imperatively rather than through `useActionState`, because a successful turn has to clear the
 * composer and the form-action pattern cannot do that without a state-in-effect.
 */
export function VideoChat({ projectId, messages }: { projectId: string; messages: VideoMessage[] }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const turn = pendingTurn(messages);
  const selected = draft.split(", ").filter(Boolean);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  async function send() {
    const content = draft.trim();
    if (content.length === 0) {
      setError("Tulis pesan dulu.");
      return;
    }

    setError("");
    setPending(true);

    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("content", content);

    const result = await sendVideoMessageAction(formData);
    setPending(false);

    // The typed text survives a failure so it can be sent again unchanged.
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
  }

  function toggleOption(option: InterviewOption) {
    if (turn?.control !== "multi_select") {
      setDraft(option.label);
      return;
    }
    setDraft((selected.includes(option.label) ? selected.filter((label) => label !== option.label) : [...selected, option.label]).join(", "));
  }

  return (
    <section className="flex min-h-[32rem] flex-col rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-7">
      <h2 className="text-lg font-semibold text-white">Percakapan</h2>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-neutral-450">Kirim pesan pertama. AI akan menanyakan satu hal pada satu waktu.</p>
        ) : (
          messages.map((message) => (
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
        {pending ? (
          <p role="status" aria-live="polite" className="text-sm text-neutral-450">
            AI sedang menyusun pertanyaan…
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {turn && turn.options.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-semibold text-white">
            Pilihan{turn.control === "multi_select" ? " (boleh lebih dari satu)" : ""}
          </legend>
          <div className="space-y-2">
            {turn.options.map((option) => {
              const isRecommended = option.id === turn.recommendedOptionId;
              const isSelected = selected.includes(option.label);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={pending}
                  onClick={() => toggleOption(option)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${focusRing} ${
                    isSelected ? "border-primary bg-primary/10" : "border-white/10 bg-pricing-bg hover:border-white/25"
                  }`}
                >
                  <span aria-hidden="true" className={`mt-1 size-4 shrink-0 rounded-full border ${isSelected ? "border-primary bg-primary" : "border-neutral-500"}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${isSelected ? "text-primary" : "text-white"}`}>
                      {option.label}
                      {isRecommended ? <small className="ml-2 font-mono text-[10px] uppercase text-primary">Rekomendasi</small> : null}
                    </span>
                    {option.detail ? <span className="mt-0.5 block text-xs leading-5 text-neutral-450">{option.detail}</span> : null}
                    {isRecommended && turn.recommendationReason ? (
                      <span className="mt-1 block text-xs leading-5 text-neutral-450">Alasan: {turn.recommendationReason}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

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
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tulis jawaban atau permintaan Anda…"
          className={`w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-primary ${focusRing}`}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[10px] text-neutral-500">AI hanya memakai fakta yang Anda konfirmasi.</p>
          <button
            type="button"
            onClick={send}
            disabled={pending}
            className={`min-h-10 rounded-full bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            {pending ? "Mengirim…" : "Kirim"}
          </button>
        </div>
      </div>
    </section>
  );
}
