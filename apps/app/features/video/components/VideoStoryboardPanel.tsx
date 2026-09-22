import { Badge } from "@visuala/ui";
import { durationLabel } from "@/domain/video/settings";
import type { StoryboardScene, VideoStoryboardRevision } from "@/domain/video/types";

function timeRange(scene: StoryboardScene): string {
  return `${scene.startSeconds}s - ${scene.endSeconds}s`;
}

export function VideoStoryboardPanel({ revision }: { revision: VideoStoryboardRevision | null }) {
  if (!revision) {
    return (
      <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
        <h2 className="text-base font-semibold text-white">Storyboard</h2>
        <p className="mt-3 rounded-2xl border border-dashed border-white/15 bg-black p-4 text-sm leading-6 text-neutral-450">
          Storyboard disusun setelah brief lengkap.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Storyboard</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {revision.scenes.length} scene, total {durationLabel(revision.totalDurationSeconds)}
          </p>
        </div>
        {revision.approvedAt ? (
          <Badge className="bg-primary px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-black">Disetujui</Badge>
        ) : null}
      </div>

      <ol className="mt-4 space-y-3">
        {revision.scenes.map((scene) => (
          <li key={scene.order} className="rounded-2xl border border-white/10 bg-pricing-bg p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-wide text-primary">Scene {scene.order}</span>
              <span className="font-mono text-[10px] text-neutral-450">{timeRange(scene)}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{scene.onScreenTitle}</p>
            <p className="mt-1 text-sm leading-6 text-neutral-300">{scene.onScreenCopy}</p>
            <p className="mt-2 text-xs leading-5 text-neutral-450">{scene.visual}</p>
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] text-neutral-500">
              <span>{scene.transition}</span>
              <span>•</span>
              <span>{scene.assetIds.length} aset</span>
              {scene.voiceOver ? (
                <>
                  <span>•</span>
                  <span>voice-over</span>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
