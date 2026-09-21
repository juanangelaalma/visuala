import { Badge } from "@visuala/ui";
import { projectStatusLabel } from "@/domain/video/settings";
import type { VideoProjectStatus } from "@/domain/video/types";

const toneClassNames: Record<VideoProjectStatus, string> = {
  draft: "bg-white/10 text-neutral-300",
  interviewing: "bg-white/10 text-neutral-300",
  awaiting_approval: "bg-primary/15 text-primary",
  approved: "bg-primary/15 text-primary",
  rendering: "bg-primary/15 text-primary",
  ready: "bg-primary text-black",
  revision_draft: "bg-white/10 text-neutral-300",
  moderation_blocked: "bg-danger/15 text-danger",
  failed: "bg-danger/15 text-danger",
  deleted: "bg-white/10 text-neutral-500",
};

export function ProjectStatusBadge({ status, className = "" }: { status: VideoProjectStatus; className?: string }) {
  return (
    <Badge className={`px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${toneClassNames[status]} ${className}`}>
      {projectStatusLabel(status)}
    </Badge>
  );
}
