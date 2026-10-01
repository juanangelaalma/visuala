import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { COMPOSITION_SPEC_VERSION } from "../../domain/video-engine/composition";
import { ARTIFACT_MANIFEST_VERSION, mimeTypeForPath } from "../../domain/video-engine/artifact-manifest";
import { sha256Hex } from "../../domain/video-engine/hash";
import { createFsDesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";
import { CompositionVisualCheckError } from "../../infrastructure/video-engine/composition-visual-check";
import { HyperframesCliError } from "../../infrastructure/video-engine/hyperframes-cli";
import { compileComposition } from "./compile";
import type { CompileCommand, CompileDependencies } from "./compile";
import type { CompositionArtifactStore } from "../../infrastructure/video-engine/composition-artifact-store";

async function fixture(): Promise<{ command: CompileCommand; dependencies: CompileDependencies; scratch: string; upload: CompositionArtifactStore["write"] }> {
  const scratch = await mkdtemp(join(tmpdir(), "visuala-compile-contract-"));
  const upload = vi.fn<CompositionArtifactStore["write"]>(async (_prefix, input) => ({
    manifestVersion: ARTIFACT_MANIFEST_VERSION,
    compositionHash: input.compositionHash,
    files: input.files.map((file) => ({ path: file.path, byteSize: file.bytes.byteLength, sha256: sha256Hex(file.bytes), mimeType: mimeTypeForPath(file.path) })),
  }));
  return {
    scratch,
    upload,
    command: {
      projectId: "project-1",
      spec: {
        schemaVersion: COMPOSITION_SPEC_VERSION,
        format: { aspectRatio: "9:16", fps: 30, durationSeconds: 4 },
        style: { id: "creative-mode", version: "1" },
        scenes: [{ id: "scene_1", durationFrames: 120, transition: "cut", motion: "staged_reveal", modules: [{ id: "Headline", kind: "internal", content: { text: "Lumpia hangat" } }, { id: "CTA", kind: "internal", content: { text: "Pesan lumpia" } }] }],
      },
      designPack: await createFsDesignPackSource().load({ id: "creative-mode", version: "1" }),
      assets: [],
      resolution: "720p",
      language: "id",
    },
    dependencies: {
      createScratchDir: async () => scratch,
      installer: { install: async () => new Map() },
      artifactStore: { write: upload, read: async () => { throw new Error("Compile must not download an artifact."); } },
      gate: { check: async () => {} },
      write: async (compiled, dir) => {
        await mkdir(dir, { recursive: true });
        for (const file of compiled.files) await writeFile(join(dir, file.path), file.contents);
      },
    },
  };
}

describe("compileComposition visual gate", () => {
  it("uploads the inspected bytes only after the gate accepts them and removes scratch", async () => {
    const { command, dependencies, scratch, upload } = await fixture();
    let inspectedHtml = "";
    dependencies.gate = {
      check: async ({ dir }) => {
        inspectedHtml = await readFile(join(dir, "index.html"), "utf8");
        expect(upload).not.toHaveBeenCalled();
      },
    };
    const result = await compileComposition(command, dependencies);
    expect(upload).toHaveBeenCalledOnce();
    const input = vi.mocked(upload).mock.calls[0]?.[1];
    const frozenHtml = input?.files.find((file) => file.path === "index.html");
    expect(new TextDecoder().decode(frozenHtml?.bytes)).toBe(inspectedHtml);
    expect(input?.compositionHash).toBe(result.compositionHash);
    expect(existsSync(scratch)).toBe(false);
  });

  it.each([
    new CompositionVisualCheckError([{ code: "text_overlap", scene: "scene_1", selector: ".hf-Headline", message: "Headline overlaps CTA", time: 2 }]),
    new HyperframesCliError("cli_unreadable", "The CLI did not return a complete check report."),
    new HyperframesCliError("cli_failed", "Font request failed."),
  ])("never uploads rejected or unreadable visual checks and removes scratch", async (failure) => {
    const { command, dependencies, scratch, upload } = await fixture();
    dependencies.gate = { check: async () => { throw failure; } };
    await expect(compileComposition(command, dependencies)).rejects.toBe(failure);
    expect(upload).not.toHaveBeenCalled();
    expect(existsSync(scratch)).toBe(false);
  });
});
