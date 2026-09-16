"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCreativeProjectAction, type CreativeVideoActionState } from "../actions/project-actions";

const initialState: CreativeVideoActionState = {};

export default function CreativeComposer() {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(createCreativeProjectAction, initialState);

  useEffect(() => {
    if (state.projectId) router.replace(`/dashboard?project=${state.projectId}`);
  }, [router, state.projectId]);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="categoryId" value="fnb" />
      <input type="hidden" name="categoryVersion" value="1" />
      <div className="space-y-2">
        <label htmlFor="creative-image" className="block text-sm font-medium text-neutral-300">Foto produk</label>
        <input id="creative-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-neutral-300 file:mr-4 file:rounded-full file:border-0 file:bg-[#EFF31B] file:px-4 file:py-2 file:font-semibold file:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFF31B]" />
      </div>
      <div className="space-y-2">
        <label htmlFor="creative-prompt" className="block text-sm font-medium text-neutral-300">Ceritakan video yang kamu butuhkan</label>
        <textarea id="creative-prompt" name="prompt" required minLength={3} rows={5} placeholder="Contoh: Buat konten jualan untuk promo minuman baru..." className="w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-white placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFF31B]" />
      </div>
      {state.error ? <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-full bg-[#EFF31B] px-6 py-3 font-semibold text-black transition hover:bg-[#dfe31a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60">{pending ? "Menyimpan proyek..." : "Mulai buat video"}</button>
    </form>
  );
}
