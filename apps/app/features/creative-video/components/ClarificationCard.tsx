"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { answerCreativeVideoAction, type CreativeVideoActionState } from "../actions/project-actions";
import { refreshAfterRevisionConflict } from "./clarification-refresh";

type ClarificationCardProps = {
  projectId: string;
  revision: number;
  questions: readonly string[];
};

export default function ClarificationCard({ projectId, revision, questions }: ClarificationCardProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(answerCreativeVideoAction, {} as CreativeVideoActionState);
  const router = useRouter();

  useEffect(() => {
    refreshAfterRevisionConflict(state, router.refresh);
  }, [router.refresh, state]);
  return (
    <form action={action} className="rounded-3xl border border-[#EFF31B]/30 bg-[#EFF31B]/5 p-5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#EFF31B]">Jawab singkat</p>
      <ul className="mt-3 space-y-2 text-sm text-white">{questions.map((question) => <li key={question}>• {question}</li>)}</ul>
      <label htmlFor="clarification-answer" className="mt-5 block text-sm font-medium text-neutral-300">Jawabanmu</label>
      <textarea id="clarification-answer" name="answer" required rows={3} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFF31B]" />
      {state.error ? <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p> : null}
      <p aria-live="polite" className="mt-3 text-sm text-neutral-300">{state.refreshRequired ? "Memuat versi proyek terbaru..." : ""}</p>
      <button disabled={pending} className="mt-4 min-h-11 rounded-full bg-[#EFF31B] px-6 py-3 font-semibold text-black disabled:opacity-60">{pending ? "Menyimpan..." : "Kirim jawaban"}</button>
    </form>
  );
}
