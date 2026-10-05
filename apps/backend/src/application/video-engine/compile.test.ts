import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { COMPOSITION_SPEC_VERSION } from "../../domain/video-engine/composition";
import { ARTIFACT_MANIFEST_VERSION, mimeTypeForPath } from "../../domain/video-engine/artifact-manifest";
import { sha256Hex } from "../../domain/video-engine/hash";
import { CompositionGenerationError } from "../../domain/video-engine/errors";
import { createFsDesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";
import { CompositionVisualCheckError } from "../../infrastructure/video-engine/composition-visual-check";
import { HyperframesCliError, HyperframesContentError } from "../../infrastructure/video-engine/hyperframes-cli";
import { compileComposition } from "./compile";
import type { CompileCommand, CompileDependencies } from "./compile";
import type { CompositionArtifactStore } from "../../infrastructure/video-engine/composition-artifact-store";
import { CompositionAuthorError, type CompositionAuthorResult, type CompositionCorrection } from "./composition-author";

function htmlFor(marker: string) {
  return `<!doctype html><html><body>
<div data-composition-id="main" data-fps="30" data-duration="4" data-width="720" data-height="1280">
<section class="clip hf-scene" data-track-index="0" data-scene="scene_1" data-start="0" data-duration="4"><div class="hf-scene__content"><p class="hf-module">${marker}</p></div></section>
</div><script src="vendor/gsap.min.js"></script><script>window.__timelines.main = gsap.timeline({paused:true});</script></body></html>`;
}

function authored(html: string, requestId = "html-request"): CompositionAuthorResult {
  return {
    html,
    ai: { requestId, profileId: "primary", provider: "test", model: "test", providerRequestId: null, attemptCount: 1, finishReason: "stop", usage: { inputTokens: null, outputTokens: null, totalTokens: null }, estimatedCost: null, latencyMs: 1 },
  };
}

const overlapIssue = { code: "text_overlap", scene: "scene_1", selector: ".hf-Headline", message: "Headline overlaps CTA", time: 2, bbox: { x: 0, y: 0, width: 10, height: 20 } };

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
      userId: "user-1",
      brief: { productName: "Lumpia", brandName: null, keyMessage: "Lumpia hangat", callToAction: "Pesan lumpia", orderDestination: null, audience: null, objective: null, productCategory: null, offer: null, menuItems: null },
      artDirection: { mainMessage: "Lumpia hangat", visualFocus: "Lumpia", hierarchy: ["Lumpia"], mood: "Hangat", imageTreatment: "Rapat", motionDirection: "Dinamis", beats: [{ id: "scene_1", intent: "Produk", emphasis: "high" }] },
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
      author: async () => authored(htmlFor("Authored by the model")),
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
    expect(inspectedHtml).toBe(htmlFor("Authored by the model"));
    expect(result.author.requestId).toBe("html-request");
    expect(input?.compositionHash).toBe(result.compositionHash);
    expect(existsSync(scratch)).toBe(false);
  });

  it.each([
    new HyperframesCliError("cli_unreadable", "The CLI did not return a complete check report."),
    new HyperframesCliError("cli_failed", "Font request failed."),
    new CompositionVisualCheckError([{ ...overlapIssue, code: "future_geometry_code" }]),
    new CompositionVisualCheckError([overlapIssue, { ...overlapIssue, code: "visual_check_unreadable" }]),
    new CompositionVisualCheckError([{ ...overlapIssue, code: "image_missing" }]),
    new CompositionVisualCheckError([{ ...overlapIssue, code: "font_missing" }]),
    new CompositionVisualCheckError([{ ...overlapIssue, code: "runtime_error" }]),
  ])("never uploads rejected or unreadable visual checks and removes scratch", async (failure) => {
    const { command, dependencies, scratch, upload } = await fixture();
    dependencies.author = vi.fn(dependencies.author);
    dependencies.gate = { check: async () => { throw failure; } };
    await expect(compileComposition(command, dependencies)).rejects.toBe(failure);
    expect(upload).not.toHaveBeenCalled();
    expect(dependencies.author).toHaveBeenCalledOnce();
    expect(existsSync(scratch)).toBe(false);
  });

  it.each([2, 3])("freezes only generation %i after corrections and removes stale files", async (generations) => {
    const { command, dependencies, scratch, upload } = await fixture();
    const feedback: (CompositionCorrection | undefined)[] = [];
    const inspections: string[] = [];
    dependencies.author = vi.fn(async (_command, _blocks, correction) => {
      feedback.push(correction);
      return authored(htmlFor(`generation ${feedback.length}`), `request-${feedback.length}`);
    });
    const write = dependencies.write;
    dependencies.write = async (compiled, dir) => {
      await write(compiled, dir);
      if (inspections.length === 0) await writeFile(join(dir, "rejected-only.txt"), "stale");
    };
    dependencies.gate = {
      check: async ({ dir }) => {
        inspections.push(await readFile(join(dir, "index.html"), "utf8"));
        expect(upload).not.toHaveBeenCalled();
        if (inspections.length > 1) expect(existsSync(join(dir, "rejected-only.txt"))).toBe(false);
        if (inspections.length < generations) throw new CompositionVisualCheckError([overlapIssue]);
      },
    };
    const result = await compileComposition(command, dependencies);
    expect(dependencies.author).toHaveBeenCalledTimes(generations);
    expect(feedback[0]).toBeUndefined();
    for (let index = 1; index < generations; index++) {
      expect(feedback[index]).toEqual({ previousHtml: htmlFor(`generation ${index}`), issues: [overlapIssue] });
    }
    const frozen = vi.mocked(upload).mock.calls[0]![1];
    expect(new TextDecoder().decode(frozen.files.find((file) => file.path === "index.html")!.bytes)).toBe(htmlFor(`generation ${generations}`));
    expect(frozen.files.some((file) => file.path === "rejected-only.txt")).toBe(false);
    expect(result.author.requestId).toBe(`request-${generations}`);
    expect(frozen.compositionHash).toBe(result.compositionHash);
    expect(upload).toHaveBeenCalledOnce();
    expect(existsSync(scratch)).toBe(false);
  });

  it("uses the latest HTML when structure rejection is followed by visual rejection", async () => {
    const { command, dependencies, upload } = await fixture();
    const feedback: (CompositionCorrection | undefined)[] = [];
    const invalid = "<!doctype html><html>truncated";
    dependencies.author = vi.fn(async (_command, _blocks, correction) => {
      feedback.push(correction);
      if (feedback.length === 1) throw new CompositionAuthorError("Document incomplete", "html_document_invalid", invalid, "request-1");
      return authored(htmlFor(`generation ${feedback.length}`), `request-${feedback.length}`);
    });
    dependencies.gate.check = vi.fn()
      .mockRejectedValueOnce(new CompositionVisualCheckError([overlapIssue]))
      .mockResolvedValueOnce(undefined);
    await compileComposition(command, dependencies);
    expect(feedback[1]).toEqual({ previousHtml: invalid, issues: [{ code: "html_document_invalid", message: "Document incomplete" }] });
    expect(feedback[2]).toEqual({ previousHtml: htmlFor("generation 2"), issues: [overlapIssue] });
    expect(dependencies.gate.check).toHaveBeenCalledTimes(2);
    expect(new TextDecoder().decode(vi.mocked(upload).mock.calls[0]![1].files.find((file) => file.path === "index.html")!.bytes)).toBe(htmlFor("generation 3"));
  });

  it("revalidates an invalid replacement before inspecting or freezing it", async () => {
    const { command, dependencies, upload } = await fixture();
    const invalid = htmlFor("generation 2").replace('data-duration="4" data-width', 'data-duration="99" data-width');
    const feedback: (CompositionCorrection | undefined)[] = [];
    dependencies.author = vi.fn(async (_command, _blocks, correction) => {
      feedback.push(correction);
      return authored(feedback.length === 2 ? invalid : htmlFor(`generation ${feedback.length}`));
    });
    dependencies.gate.check = vi.fn()
      .mockRejectedValueOnce(new CompositionVisualCheckError([overlapIssue]))
      .mockResolvedValueOnce(undefined);
    await compileComposition(command, dependencies);
    expect(feedback[2]?.previousHtml).toBe(invalid);
    expect(feedback[2]?.issues.map((issue) => issue.code)).toEqual(["html_root_invalid"]);
    expect(dependencies.gate.check).toHaveBeenCalledTimes(2);
    expect(new TextDecoder().decode(vi.mocked(upload).mock.calls[0]![1].files.find((file) => file.path === "index.html")!.bytes)).toBe(htmlFor("generation 3"));
  });

  it.each(["structural", "visual"] as const)("bounds repeated %s rejection at three generations without uploading", async (kind) => {
    const { command, dependencies, scratch, upload } = await fixture();
    dependencies.author = vi.fn(async () => authored(kind === "structural" ? "invalid document" : htmlFor("still overlaps")));
    dependencies.gate.check = vi.fn(async () => { throw new CompositionVisualCheckError([overlapIssue]); });
    const promise = compileComposition(command, dependencies);
    await expect(promise).rejects.toBeInstanceOf(CompositionGenerationError);
    await expect(promise).rejects.toMatchObject({
      code: kind === "structural" ? "composition_html_invalid" : "composition_visual_check_failed",
      issueCodes: [kind === "structural" ? "html_document_invalid" : "text_overlap"],
      attempts: 3,
    });
    expect(dependencies.author).toHaveBeenCalledTimes(3);
    expect(dependencies.gate.check).toHaveBeenCalledTimes(kind === "structural" ? 0 : 3);
    expect(upload).not.toHaveBeenCalled();
    expect(existsSync(scratch)).toBe(false);
  });

  it.each(["author", "writer", "storage", "installer"] as const)("preserves %s failures without scheduling correction", async (stage) => {
    const { command, dependencies, scratch, upload } = await fixture();
    const failure = stage === "writer"
      ? new CompositionVisualCheckError([overlapIssue])
      : new Error(`${stage} failed`);
    dependencies.author = vi.fn(dependencies.author);
    if (stage === "author") dependencies.author = vi.fn(async () => { throw failure; });
    if (stage === "writer") dependencies.write = async () => { throw failure; };
    if (stage === "storage") vi.mocked(upload).mockRejectedValueOnce(failure);
    if (stage === "installer") dependencies.installer.install = async () => { throw failure; };
    await expect(compileComposition(command, dependencies)).rejects.toBe(failure);
    expect(dependencies.author).toHaveBeenCalledTimes(stage === "installer" ? 0 : 1);
    expect(upload).toHaveBeenCalledTimes(stage === "storage" ? 1 : 0);
    expect(existsSync(scratch)).toBe(false);
  });

  it("corrects positively classified CLI content failures with all finding details", async () => {
    const { command, dependencies, upload } = await fixture();
    const finding = { code: "content_overlap", severity: "error" as const, message: "Headline intersects CTA", selector: "#scene_1 .headline", sourceFile: "index.html", time: 1.5 };
    const feedback: (CompositionCorrection | undefined)[] = [];
    dependencies.author = vi.fn(async (_command, _blocks, correction) => {
      feedback.push(correction);
      return authored(htmlFor(`generation ${feedback.length}`));
    });
    dependencies.gate.check = vi.fn()
      .mockRejectedValueOnce(new HyperframesContentError("CLI found overlapping content", [finding]))
      .mockResolvedValueOnce(undefined);
    await compileComposition(command, dependencies);
    expect(feedback[1]).toEqual({ previousHtml: htmlFor("generation 1"), issues: [finding] });
    expect(new TextDecoder().decode(vi.mocked(upload).mock.calls[0]![1].files.find((file) => file.path === "index.html")!.bytes)).toBe(htmlFor("generation 2"));
  });

  it.each([
    new CompositionAuthorError("No rejected generation attached"),
    new CompositionAuthorError("Unrecognized validation failure", "future_validation_code", "rejected HTML", "request-1"),
  ])("does not correct unclassified author failures", async (failure) => {
    const { command, dependencies, scratch, upload } = await fixture();
    dependencies.author = vi.fn(async () => { throw failure; });
    await expect(compileComposition(command, dependencies)).rejects.toBe(failure);
    expect(dependencies.author).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
    expect(existsSync(scratch)).toBe(false);
  });
});
