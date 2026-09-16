import type { CreativeProjectAggregate } from "@/domain/creative-video/types";
import Image from "next/image";
import ConceptGrid from "./ConceptGrid";
import ConversationTimeline from "./ConversationTimeline";
import CreativeComposer from "./CreativeComposer";
import CreativeWorkspaceShell from "./CreativeWorkspaceShell";

export default function CreativeVideoWorkspace({ aggregate }: { aggregate: CreativeProjectAggregate | null }) {
  const chat = <section className="min-h-[620px] rounded-3xl border border-white/10 bg-[#101010] p-5 md:p-7"><h2 className="font-display text-2xl font-bold text-white">Creative chat</h2><p className="mt-2 text-sm text-neutral-400">Satu foto, satu brief, tiga arah kreatif.</p>{aggregate ? <div className="relative mt-6 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black"><Image src={`/api/creative-projects/${aggregate.project.id}/image`} alt="Foto produk untuk proyek video" fill sizes="(max-width: 1024px) 100vw, 50vw" unoptimized className="object-contain" /></div> : null}<div className="mt-7">{aggregate ? <ConversationTimeline aggregate={aggregate} /> : <CreativeComposer />}</div>{aggregate?.project.state === "concepts_ready" ? <div className="mt-7"><ConceptGrid concepts={aggregate.concepts} /></div> : null}</section>;
  const preview = <aside className="min-h-[620px] rounded-3xl border border-white/10 bg-[#161616] p-5 md:p-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Preview 9:16</p><div className="mx-auto mt-6 flex aspect-[9/16] max-h-[500px] max-w-[282px] items-center justify-center rounded-3xl border border-white/10 bg-black px-8 text-center text-sm text-neutral-500">Preview bergerak tersedia di tahap berikutnya setelah kamu memilih ide.</div></aside>;
  return <CreativeWorkspaceShell projectId={aggregate?.project.id} revision={aggregate?.project.revision} state={aggregate?.project.state} chat={chat} preview={preview} />;
}
