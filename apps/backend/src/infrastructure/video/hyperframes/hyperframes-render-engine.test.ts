import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { RenderCancelledError } from "@hyperframes/producer";
import { describe, expect, it, vi } from "vitest";
import { HyperFramesRenderEngine } from "./hyperframes-render-engine";
import { gsapScriptPath } from "./gsap-script";
import { renderManifestFingerprint, sha256Hex } from "../../../domain/video/render-manifest";
import { manifestAssetFixture, manifestFixture, manifestSceneFixture } from "../../../domain/video/render-manifest.test-helpers";

const run = promisify(execFile);
const E2E = process.env.RENDER_ENGINE_E2E === "1";

const testConfig = {
  fps: 30,
  quality: "standard" as const,
  maxOutputBytes: 524_288_000,
  browserPath: process.env.HYPERFRAMES_BROWSER_PATH ?? null,
  ffmpegPath: null,
  extractCacheDir: null,
  lowMemoryMode: false,
  maxWorkers: 1,
  disableGpu: true,
};

/** A probe that agrees with `manifestFixture()`; every test that expects a throw passes its own. */
const okProbe = async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 10 });

function engine(
  probe = vi.fn(okProbe),
  executeRender = vi.fn(async () => undefined),
  // The producer call and the file writes are injected so the unit tests never launch Chrome and
  // never touch the filesystem; only the E2E cases below exercise both for real.
  writeFiles = vi.fn(async () => undefined),
) {
  return new HyperFramesRenderEngine({
    config: testConfig,
    objectStore: { read: async () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]) },
    gsapScriptPath: "/nonexistent/gsap.min.js",
    probe,
    executeRender,
    writeComposition: writeFiles,
  });
}

describe("HyperFramesRenderEngine", () => {
  it("resolves the vendored animation runtime to a file that exists", () => {
    // The composition references this path, and the writer copies it in, so a resolution that points
    // nowhere would fail every render at the first frame.
    const path = gsapScriptPath();
    expect(path).toMatch(/gsap\.min\.js$/);
    expect(existsSync(path)).toBe(true);
  });

  it("fails the render when the encoded file disagrees with the manifest", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 7, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 10 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_invalid" });
  });

  it("fails the render when the frame size is not the one the settings asked for", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1080, frameRate: 30, hasAudio: false, byteSize: 10 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_invalid" });
  });

  it("fails the render when the frame rate is not the one the manifest asked for", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 24, hasAudio: false, byteSize: 10 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_invalid" });
  });

  it("refuses an output over the configured ceiling before it is uploaded", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 999_999_999 })));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_output_too_large" });
  });

  it("maps an aborted render to an engine failure, not a crash", async () => {
    const subject = engine(undefined, vi.fn(async () => { throw new RenderCancelledError("aborted", "aborted"); }));
    await expect(subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" }))
      .rejects.toMatchObject({ code: "render_engine_failed" });
  });

  it("returns the manifest fingerprint it rendered, ready for the version row", async () => {
    const subject = engine(vi.fn(async () => ({ durationSeconds: 10, width: 1080, height: 1920, frameRate: 30, hasAudio: false, byteSize: 10 })));
    const result = await subject.render({ manifest: manifestFixture(), workDir: "/tmp/x", outputPath: "/tmp/x/out.mp4" });
    expect(result.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe.skipIf(!E2E)("HyperFramesRenderEngine (real render)", () => {
  /** A 720p, six-second, 9:16 manifest whose single asset really exists in the fake object store. */
  async function realManifestAndAsset() {
    const dir = await mkdtemp(join(tmpdir(), "hf-e2e-"));
    const assetPath = join(dir, "asset.png");
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0xEFF31B:s=720x1280", "-frames:v", "1", assetPath]);
    const assetBytes = new Uint8Array(await readFile(assetPath));

    const manifest = manifestFixture({
      width: 720,
      height: 1280,
      durationSeconds: 6,
      resolution: "720p",
      scenes: [
        manifestSceneFixture({ order: 1, startSeconds: 0, endSeconds: 3 }),
        manifestSceneFixture({ order: 2, startSeconds: 3, endSeconds: 6 }),
      ],
      assets: [{ ...manifestAssetFixture(), byteSize: assetBytes.byteLength, sha256: sha256Hex(assetBytes), width: 720, height: 1280 }],
    });

    return { manifest, assetBytes };
  }

  function realEngine(assetBytes: Uint8Array) {
    return new HyperFramesRenderEngine({
      config: { ...testConfig, quality: "draft" },
      objectStore: { read: async () => assetBytes },
      gsapScriptPath: gsapScriptPath(),
    });
  }

  it("renders a real six-second 720p file whose probe matches the manifest", async () => {
    const { manifest, assetBytes } = await realManifestAndAsset();
    const workDir = await mkdtemp(join(tmpdir(), "hf-e2e-work-"));

    const result = await realEngine(assetBytes).render({ manifest, workDir, outputPath: join(workDir, "render.mp4") });

    expect(result.probe.width).toBe(720);
    expect(result.probe.height).toBe(1280);
    expect(result.probe.durationSeconds).toBeGreaterThan(6 - 1 / 24);
    expect(result.probe.durationSeconds).toBeLessThan(6 + 1 / 24);
    expect(result.probe.byteSize).toBeGreaterThan(0);
    expect(result.manifestHash).toBe(renderManifestFingerprint(manifest));
    expect((await readFile(result.outputPath)).byteLength).toBeGreaterThan(0);
    // A real render is wall-clock bound: Chrome has to start and FFmpeg has to encode, so the
    // default test budget cannot hold it.
  }, 180_000);

  it("produces byte-identical files for two renders of the same manifest", async () => {
    const { manifest, assetBytes } = await realManifestAndAsset();
    const first = await mkdtemp(join(tmpdir(), "hf-det-a-"));
    const second = await mkdtemp(join(tmpdir(), "hf-det-b-"));

    const engineOne = realEngine(assetBytes);
    const a = await engineOne.render({ manifest, workDir: first, outputPath: join(first, "render.mp4") });
    const b = await engineOne.render({ manifest, workDir: second, outputPath: join(second, "render.mp4") });

    const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    expect(digest(new Uint8Array(await readFile(a.outputPath)))).toBe(digest(new Uint8Array(await readFile(b.outputPath))));
  }, 300_000);
});
