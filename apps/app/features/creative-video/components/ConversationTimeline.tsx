import type { CreativeProjectAggregate } from "@/domain/creative-video/types";
import ClarificationCard from "./ClarificationCard";

export default function ConversationTimeline({ aggregate }: { aggregate: CreativeProjectAggregate }) {
  return (
    <div className="space-y-4">
      {aggregate.messages.map((message) => (
        <article key={message.id} className={`max-w-[88%] rounded-3xl px-5 py-4 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-white text-black" : "border border-white/10 bg-[#161616] text-white"}`}>
          {message.text}
        </article>
      ))}
      {aggregate.project.state === "analyzing" ? <div aria-live="polite" className="rounded-3xl border border-white/10 bg-[#161616] p-5 text-white"><span className="text-[#EFF31B]">●</span> Memahami produkmu...</div> : null}
      {aggregate.project.state === "needs_input" && aggregate.brief ? <ClarificationCard projectId={aggregate.project.id} revision={aggregate.project.revision} questions={aggregate.brief.missingRequiredQuestions} /> : null}
    </div>
  );
}
