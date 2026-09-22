import { readFile, readdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { writeComposition } from "./composition-writer";
import { sha256Hex } from "../../../domain/video/render-manifest";
import { manifestAssetFixture, manifestFixture } from "../../../domain/video/render-manifest.test-helpers";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hf-writer-"));
}

// The writer copies the real runtime in, so the test gives it a real file to copy rather than a stub
// that could never make the asserted output appear on disk.
const runtimeDir = await mkdtemp(join(tmpdir(), "hf-gsap-"));
const runtimePath = join(runtimeDir, "gsap.min.js");
await writeFile(runtimePath, "/* gsap */", "utf8");

function dependencies(bytes = PNG) {
  return {
    objectStore: { read: vi.fn(async () => bytes) },
    gsapScriptPath: runtimePath,
  };
}

/**
 * A manifest whose frozen hash describes the bytes the object store serves. The shared fixture pins
 * a placeholder hash, and the writer's whole job is to refuse bytes that do not match it, so a happy
 * path has to state the real digest of the bytes it hands over.
 */
function manifestServing(bytes: Uint8Array) {
  return manifestFixture({ assets: [{ ...manifestAssetFixture(), byteSize: bytes.byteLength, sha256: sha256Hex(bytes) }] });
}

describe("writeComposition", () => {
  it("writes the composition and every referenced asset under the work directory", async () => {
    const manifest = manifestServing(PNG);
    const workDir = await temporaryDirectory();
    const deps = dependencies();

    await writeComposition(manifest, workDir, deps);

    expect(await readdir(workDir)).toEqual(expect.arrayContaining(["index.html", "styles.css"]));
    expect(await readdir(join(workDir, "assets"))).toEqual(["asset-1.png"]);
    expect(await readdir(join(workDir, "vendor"))).toEqual(["gsap.min.js"]);
    expect(deps.objectStore.read).toHaveBeenCalledWith("video-projects/p/asset-1.png", expect.any(Number));
  });

  it("refuses an asset whose bytes no longer match the hash the manifest froze", async () => {
    await expect(writeComposition(manifestServing(PNG), await temporaryDirectory(), dependencies(Uint8Array.from([1, 2, 3]))))
      .rejects.toMatchObject({ code: "render_asset_mutated" });
  });

  it("refuses a manifest that references an asset it does not carry", async () => {
    const manifest = { ...manifestFixture(), assets: [] };
    await expect(writeComposition(manifest, await temporaryDirectory(), dependencies()))
      .rejects.toMatchObject({ code: "render_asset_missing" });
  });

  it("is idempotent for the same manifest, so a resumed render sees identical files", async () => {
    const manifest = manifestServing(PNG);
    const workDir = await temporaryDirectory();
    await writeComposition(manifest, workDir, dependencies());
    const first = await readFile(join(workDir, "index.html"), "utf8");
    await writeComposition(manifest, workDir, dependencies());
    expect(await readFile(join(workDir, "index.html"), "utf8")).toBe(first);
  });
});

