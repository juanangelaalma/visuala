/**
 * Render is intentionally unavailable. `POST /video-projects/:id/render-jobs` works, but the worker
 * that would claim the job and produce an MP4 belongs to the render plan, which has not shipped and
 * cannot run here: HyperFrames is not installed. Queueing a job would leave the project stuck in
 * `rendering` with nothing to finish it, so the control stays disabled and says why.
 */
export function RenderStatusPanel() {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner">
      <h2 className="text-base font-semibold text-white">Render</h2>
      <p className="mt-3 text-sm leading-6 text-neutral-450">Mesin render (HyperFrames) belum tersedia, jadi MP4 belum bisa dibuat.</p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="mt-4 h-11 w-full cursor-not-allowed rounded-full bg-white/10 px-5 text-sm font-semibold text-neutral-400"
      >
        Render video
      </button>
    </section>
  );
}
