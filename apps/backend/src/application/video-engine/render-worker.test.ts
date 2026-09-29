import { describe, expect, it, vi } from "vitest";
import { COMPOSITION_SPEC_VERSION, catalogInstances, type CompositionSpec } from "../../domain/video-engine/composition";
import { toValidationBrief } from "./validation-brief";
import { isReclaimDue, nextQueuedRenderJobId, reclaimIntervalMs, reclaimStaleRenderJobs } from "./render-worker";

const spec: CompositionSpec = {
  schemaVersion: COMPOSITION_SPEC_VERSION,
  format: { aspectRatio: "9:16", fps: 30, durationSeconds: 12 },
  style: { id: "creative-mode", version: "1" },
  scenes: [
    { id: "scene_1", durationFrames: 180, modules: [{ id: "product-reveal", kind: "catalog", content: { headline: "Julumpia" } }, { id: "Headline", kind: "internal", content: { text: "Julumpia" } }] },
    { id: "scene_2", durationFrames: 180, modules: [{ id: "product-reveal", kind: "catalog", content: { headline: "Diskon 20%" } }, { id: "CTA", kind: "internal", content: { text: "Pesan sekarang" } }] },
  ],
};

describe("catalogInstances", () => {
  it("lists each catalog block once, in first-use order, with the values to bake into it", () => {
    expect(catalogInstances(spec)).toEqual([{ name: "product-reveal", vars: { headline: "Julumpia" } }]);
  });

  it("ignores internal modules", () => {
    expect(catalogInstances({ ...spec, scenes: [{ id: "scene_1", durationFrames: 360, modules: [{ id: "CTA", kind: "internal", content: { text: "x" } }] }] })).toEqual([]);
  });
});

describe("toValidationBrief", () => {
  it("keeps only what a composition may quote", () => {
    const brief = toValidationBrief({
      productName: "Julumpia",
      productCategory: "Makanan",
      audience: "Mahasiswa",
      objective: "Tambah pesanan",
      keyMessage: "Diskon 20% untuk semua menu",
      offer: { label: "Diskon 20%", detail: "Berlaku hari ini" },
      callToAction: "Pesan sekarang",
      orderDestination: "0811",
      brandName: "Julumpia",
      styleId: "creative-mode",
      outputSettings: { durationSeconds: 12, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
      menuItems: null,
      facts: [],
    });

    expect(brief).toEqual({
      productName: "Julumpia",
      brandName: "Julumpia",
      keyMessage: "Diskon 20% untuk semua menu",
      callToAction: "Pesan sekarang",
      orderDestination: "0811",
      audience: "Mahasiswa",
      objective: "Tambah pesanan",
      productCategory: "Makanan",
      offer: { label: "Diskon 20%", detail: "Berlaku hari ini" },
      menuItems: null,
    });
    expect(JSON.stringify(brief)).not.toMatch(/styleId|facts|outputSettings/);
  });
});

describe("the render worker's reclaim schedule", () => {
  it("reclaims at half the staleness window, never faster than the poll", () => {
    expect(reclaimIntervalMs({ pollMs: 2000, staleJobMs: 900_000 })).toBe(450_000);
    expect(reclaimIntervalMs({ pollMs: 2000, staleJobMs: 3000 })).toBe(2000);
  });

  it("is due only once the interval has passed", () => {
    expect(isReclaimDue(1000, 0, 1000)).toBe(true);
    expect(isReclaimDue(999, 0, 1000)).toBe(false);
  });

  it("takes the oldest queued job, or null when the queue is empty", async () => {
    await expect(nextQueuedRenderJobId({ listQueued: vi.fn(async () => [{ id: "job-1" }]) } as never)).resolves.toBe("job-1");
    await expect(nextQueuedRenderJobId({ listQueued: vi.fn(async () => []) } as never)).resolves.toBeNull();
  });

  it("fails every abandoned job it finds, so its project is not stuck in rendering", async () => {
    const jobs = {
      listStale: vi.fn(async () => [{ id: "job-1", projectId: "p-1", userId: "u-1", status: "rendering" }, { id: "job-2", projectId: "p-1", userId: "u-1", status: "rendering" }]),
      getById: vi.fn(async (id: string) => ({ id, projectId: "p-1", userId: "u-1", status: "rendering" })),
      fail: vi.fn(async (id: string) => ({ id, projectId: "p-1", userId: "u-1", status: "failed" })),
    };
    const events = { record: vi.fn(async () => undefined) };

    await expect(reclaimStaleRenderJobs({ jobs: jobs as never, events: events as never }, { startedBefore: "now", limit: 10 })).resolves.toBe(2);
    expect(jobs.fail).toHaveBeenCalledWith("job-1", "render_stale");
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ event: "render_failed", renderErrorCode: "render_stale" }));
  });

  it("leaves a job that finished on its own alone", async () => {
    const jobs = {
      listStale: vi.fn(async () => [{ id: "job-1" }]),
      getById: vi.fn(async () => ({ id: "job-1", projectId: "p-1", userId: "u-1", status: "succeeded" })),
      fail: vi.fn(),
    };

    await expect(reclaimStaleRenderJobs({ jobs: jobs as never, events: { record: vi.fn() } as never }, { startedBefore: "now", limit: 10 })).resolves.toBe(0);
    expect(jobs.fail).not.toHaveBeenCalled();
  });
});
