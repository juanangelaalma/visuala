import type { Concept } from "@/domain/creative-video/types";
import ConceptCard from "./ConceptCard";

export default function ConceptGrid({ concepts }: { concepts: readonly Concept[] }) {
  return <div className="grid gap-4 xl:grid-cols-3">{concepts.map((concept) => <ConceptCard key={concept.id} concept={concept} />)}</div>;
}
