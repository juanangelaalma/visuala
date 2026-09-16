import type { Concept } from "@/domain/creative-video/types";

export default function ConceptCard({ concept }: { concept: Concept }) {
  return (
    <article className={`rounded-3xl border p-5 ${concept.recommended ? "border-[#EFF31B] bg-[#EFF31B]/5" : "border-white/10 bg-[#161616]"}`}>
      {concept.recommended ? <span className="rounded-full bg-[#EFF31B] px-3 py-1 text-xs font-bold uppercase tracking-wider text-black">Rekomendasi</span> : null}
      <h3 className="mt-4 font-display text-xl font-bold text-white">{concept.title}</h3>
      <p className="mt-2 text-sm font-medium text-[#EFF31B]">{concept.hook}</p>
      <p className="mt-2 text-sm text-neutral-300">{concept.angle}</p>
      <ol className="mt-4 grid grid-cols-2 gap-2 text-xs text-neutral-400">{concept.sceneOutline.map((scene, index) => <li key={`${concept.id}-${index}`} className="rounded-xl bg-black p-3">{index + 1}. {scene}</li>)}</ol>
      <p className="mt-4 text-sm text-neutral-300">{concept.fitReason}</p>
      {concept.recommended ? <p className="mt-2 text-xs text-neutral-400">{concept.recommendationReason}</p> : null}
      <p className="mt-5 text-sm text-neutral-500">Pemilihan ide tersedia pada tahap preview berikutnya.</p>
    </article>
  );
}
