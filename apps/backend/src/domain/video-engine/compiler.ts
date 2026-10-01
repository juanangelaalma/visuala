import { canonicalJson, sha256Hex } from "./hash";
import { localFontFaceCss } from "./design-pack";
import { frameSizeFor } from "./format";
import { internalModuleById } from "./modules/registry";
import { SCENE_LAYOUT_CSS } from "./modules/layout";
import { COMPOSITION_ID, sceneTimeline } from "./composition";
import type { CompositionSpec, CompositionScene } from "./composition";
import type { DesignPackManifest } from "./design-pack";

export const COMPILER_VERSION = "1.1.0";

export type CompileAsset = {
  id: string;
  objectKey: string;
  sha256: string;
  mimeType: string;
  fileName: string;
};

/** A registry item that has already been installed and normalised into a sub-composition. */
export type CompiledBlock = {
  name: string;
  /** Path inside the artifact, e.g. `compositions/badge-pop.html`. */
  entryPath: string;
  entryContents: string;
  /** Every other file the block ships, copied verbatim with the hash of its bytes. */
  files: readonly CompiledBinaryRef[];
};

export type CompileInput = {
  spec: CompositionSpec;
  designPack: DesignPackManifest;
  assets: readonly CompileAsset[];
  blocks: ReadonlyMap<string, CompiledBlock>;
  resolution: "720p" | "1080p";
  language: string;
};

export type CompiledFile = { path: string; contents: string };
export type CompiledAssetRef = { path: string; objectKey: string; sha256: string };
export type CompiledFontRef = { path: string; package: string; file: string };

export type CompiledBinaryRef = { path: string; sha256: string; sourcePath: string };

export type CompiledComposition = {
  compositionId: string;
  files: readonly CompiledFile[];
  /** Non-text files from the installed blocks, copied into the artifact from `sourcePath`. */
  binaries: readonly CompiledBinaryRef[];
  /** Uploaded assets the composition references, fetched from the object store by `objectKey`. */
  assets: readonly CompiledAssetRef[];
  fonts: readonly CompiledFontRef[];
  moduleVersions: Record<string, string>;
  /** Identity of the frozen artifact: any change to content, versions, or asset bytes changes it. */
  compositionHash: string;
};

class CompilerError extends Error {
  constructor(readonly code: "compiler_unknown_module" | "compiler_block_missing" | "compiler_file_collision", message: string) {
    super(message);
    this.name = "CompilerError";
  }
}

/** Turns a validated spec into the bytes of a self-contained project: no filesystem, no network, so the same input always compiles to the same bytes. */
export function buildComposition(input: CompileInput): CompiledComposition {
  const { spec, designPack } = input;
  const frame = frameSizeFor(spec.format.aspectRatio, input.resolution);
  const timeline = sceneTimeline(spec);

  const blocks = new Map<string, CompiledBlock>();
  for (const scene of spec.scenes) {
    for (const instance of scene.modules) {
      if (instance.kind !== "catalog" || blocks.has(instance.id)) continue;
      const block = input.blocks.get(instance.id);
      if (!block) throw new CompilerError("compiler_block_missing", `Catalog item ${instance.id} was not installed before compilation.`);
      blocks.set(instance.id, block);
    }
  }

  const moduleCss: string[] = [];
  const moduleVersions: Record<string, string> = {};
  const moduleAssets = input.assets.map((asset) => ({ id: asset.id, fileName: asset.fileName }));
  const scenesHtml = timeline
    .map((entry, sceneIndex) => {
      const scene = spec.scenes[sceneIndex] as CompositionScene;
      const internals = scene.modules.filter((instance) => instance.kind === "internal");
      const role = internals.some((instance) => instance.id === "CTA") ? "cta"
        : internals.some((instance) => instance.id === "OfferBadge" || instance.id === "Price") ? "offer" : "product";
      const modules = internals.map((instance) => {
        const module = internalModuleById(instance.id as never);
        const output = module.build({
          designPack,
          aspectRatio: spec.format.aspectRatio,
          content: instance.content,
          assets: moduleAssets,
        });
        moduleCss.push(`@scope (#scene-${entry.id}) {\n${output.css}\n}`);
        moduleVersions[instance.id] = module.version;
        return output.html;
      });

      const hosts = scene.modules
        .filter((instance) => instance.kind === "catalog")
        .map((instance, index) => renderHost(instance.id, blocks.get(instance.id) as CompiledBlock, entry.startFrames, entry.durationFrames, index + 1, spec.format.fps));

      return [
        `<div id="scene-${entry.id}" class="clip hf-scene" data-scene="${entry.id}" data-role="${role}" data-transition="${entry.transition}" data-motion="${entry.motion}" data-start="${seconds(entry.startFrames, spec.format.fps)}" data-duration="${seconds(entry.durationFrames, spec.format.fps)}" data-track-index="0">`,
        `  <div id="content-${entry.id}" class="hf-scene__content">`,
        ...modules.map((html) => indent(html, 2)),
        "  </div>",
        "</div>",
        ...hosts,
      ].join("\n");
    })
    .join("\n");

  const styles = [tokenCss(designPack, frame), localFontFaceCss(designPack), baseCss(frame), SCENE_LAYOUT_CSS, ...moduleCss].join("\n\n");
  const html = document(spec, input, frame, scenesHtml);

  const files: CompiledFile[] = [
    { path: "index.html", contents: html },
    { path: "styles.css", contents: styles },
    { path: "ledger.json", contents: JSON.stringify(seamLedger(spec), null, 2) },
  ];
  const binaries: CompiledBinaryRef[] = [];
  for (const block of blocks.values()) {
    files.push({ path: block.entryPath, contents: block.entryContents });
    for (const file of block.files) {
      if (binaries.some((existing) => existing.path === file.path)) {
        throw new CompilerError("compiler_file_collision", `Two blocks both provide ${file.path}.`);
      }
      binaries.push(file);
    }
  }

  const assets: CompiledAssetRef[] = referencedAssets(spec, input.assets).map((asset) => ({
    path: `assets/${asset.fileName}`,
    objectKey: asset.objectKey,
    sha256: asset.sha256,
  }));
  const fonts: CompiledFontRef[] = designPack.fonts.map((font) => ({
    path: `fonts/${font.file}`,
    package: font.package,
    file: font.file,
  }));

  return {
    compositionId: COMPOSITION_ID,
    files,
    binaries,
    assets,
    fonts,
    moduleVersions,
    compositionHash: hashComposition({ spec, designPack, frame, files, binaries, assets, moduleVersions }),
  };
}

/** The hash covers every byte the artifact will place, so an identical hash cannot render differently. */
export function hashComposition(input: {
  spec: CompositionSpec;
  designPack: DesignPackManifest;
  frame: { width: number; height: number };
  files: readonly CompiledFile[];
  binaries: readonly { path: string; sha256: string }[];
  assets: readonly CompiledAssetRef[];
  moduleVersions: Record<string, string>;
}): string {
  return sha256Hex(
    new TextEncoder().encode(
      canonicalJson({
        compilerVersion: COMPILER_VERSION,
        spec: input.spec,
        style: { id: input.designPack.styleId, version: input.designPack.version },
        frame: input.frame,
        moduleVersions: input.moduleVersions,
        assets: [...input.assets].sort(byPath).map((asset) => ({ path: asset.path, sha256: asset.sha256 })),
        binaries: [...input.binaries].sort(byPath).map((binary) => ({ path: binary.path, sha256: binary.sha256 })),
        files: [...input.files].sort(byPath).map((file) => ({ path: file.path, sha256: sha256Hex(new TextEncoder().encode(file.contents)) })),
      }),
    ),
  );
}

/** The host needs `data-composition-id` matching the sub-composition root, or `check` rejects it and its timeline never mounts. */
function renderHost(name: string, block: CompiledBlock, startFrames: number, durationFrames: number, track: number, fps: number): string {
  return `<div id="block-${track}-${name}" data-composition-id="${name}" data-composition-src="${block.entryPath}" data-start="${seconds(startFrames, fps)}" data-duration="${seconds(durationFrames, fps)}" data-track-index="${track}"></div>`;
}

function referencedAssets(spec: CompositionSpec, assets: readonly CompileAsset[]): CompileAsset[] {
  const used = new Set<string>();
  for (const scene of spec.scenes) {
    for (const instance of scene.modules) {
      if (instance.kind !== "internal") continue;
      const slot = internalModuleById(instance.id as never).slots.find((candidate) => candidate.kind === "asset");
      if (!slot) continue;
      for (const assetId of (instance.content[slot.name] ?? "").split(",").map((entry) => entry.trim())) {
        if (assetId.length > 0) used.add(assetId);
      }
    }
  }
  return assets.filter((asset) => used.has(asset.id));
}

function tokenCss(designPack: DesignPackManifest, frame: { width: number; height: number }): string {
  const lines = [":root {"];
  for (const [name, value] of Object.entries(designPack.colors)) lines.push(`  --hf-${cssTokenName(name)}: ${value};`);
  lines.push(`  --hf-display-family: "${designPack.typography.displayFamily}", system-ui, sans-serif;`);
  lines.push(`  --hf-mono-family: "${designPack.typography.monoFamily}", ui-monospace, monospace;`);
  lines.push(`  --hf-body-family: "${designPack.typography.bodyFamily}", system-ui, sans-serif;`);
  for (const [name, value] of Object.entries(designPack.spacing)) lines.push(`  --hf-${cssTokenName(name)}: ${value};`);
  lines.push(`  --hf-border: ${designPack.rules.borderCqw}cqw;`);
  lines.push(`  --hf-rule: ${designPack.rules.ruleCqw}cqw;`);
  lines.push(`  --hf-hard-shadow: ${designPack.rules.hardShadow};`);
  lines.push(`  --hf-headline-max-width: ${designPack.rules.headlineMaxWidthCqw}cqw;`);
  lines.push(`  --hf-frame-width: ${frame.width}px;`);
  lines.push(`  --hf-frame-height: ${frame.height}px;`);
  lines.push("}");
  return lines.join("\n");
}

function cssTokenName(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function baseCss(frame: { width: number; height: number }): string {
  return `*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

html, body { width: ${frame.width}px; height: ${frame.height}px; overflow: hidden; }

#hf-root {
  position: relative;
  width: ${frame.width}px;
  height: ${frame.height}px;
  overflow: hidden;
  container-type: size;
  background: var(--hf-cream);
  font-family: var(--hf-body-family), system-ui, sans-serif;
}

.hf-scene { position: absolute; inset: 0; }

.hf-module { box-sizing: border-box; }`;
}

function document(spec: CompositionSpec, input: CompileInput, frame: { width: number; height: number }, scenesHtml: string): string {
  return `<!doctype html>
<html lang="${input.language}">
<head>
<meta charset="utf-8">
<title>${COMPOSITION_ID}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div id="hf-root" data-composition-id="${COMPOSITION_ID}" data-fps="${spec.format.fps}" data-duration="${spec.format.durationSeconds}" data-width="${frame.width}" data-height="${frame.height}">
${scenesHtml}
</div>
<script src="vendor/gsap.min.js"></script>
<script>${timelineScript(input.designPack)}</script>
</body>
</html>`;
}

/** One paused timeline: every tween is absolute and `fromTo`, so any seek lands on the same visual state. */
// Paired power4 curves follow the registry cut-the-curve primitive; timed clips own the hard swap.
function timelineScript(designPack: DesignPackManifest): string {
  return `
(function () {
  var tl = gsap.timeline({ paused: true });
  var scenes = Array.from(document.querySelectorAll("[data-scene]"));
  var ENTER = ${designPack.motion.enterSeconds};
  scenes.forEach(function (scene, sceneIndex) {
    var start = Number(scene.dataset.start);
    var duration = Number(scene.dataset.duration);
    var content = scene.querySelector(".hf-scene__content");
    var incoming = sceneIndex > 0 ? scene.dataset.transition : "cut";
    var next = scenes[sceneIndex + 1];
    var outgoing = next ? next.dataset.transition : "cut";
    var entryTime = Math.min(0.3, duration / 4, sceneIndex > 0 ? Number(scenes[sceneIndex - 1].dataset.duration) / 4 : duration / 4);
    var exitTime = next ? Math.min(0.3, duration / 4, Number(next.dataset.duration) / 4) : 0;
    var settle = incoming === "cut" ? 0 : entryTime;
    var travel = Number(document.getElementById("hf-root").dataset.width) * 0.12;
    if (incoming === "zoom") {
      tl.fromTo(content, { scale: 0.88 }, { scale: 1, duration: entryTime, ease: "power4.out" }, start);
    } else if (incoming !== "cut") {
      tl.fromTo(content, { x: travel }, { x: 0, duration: entryTime, ease: "power4.out" }, start);
    }
    if (outgoing === "zoom") {
      tl.fromTo(content, { scale: 1 }, { scale: 1.12, duration: exitTime, ease: "power4.in", immediateRender: false }, start + duration - exitTime);
    } else if (outgoing !== "cut") {
      tl.fromTo(content, { x: 0 }, { x: -travel, duration: exitTime, ease: "power4.in", immediateRender: false }, start + duration - exitTime);
      if (outgoing === "fade") {
        tl.fromTo(content, { opacity: 1 }, { opacity: 0.35, duration: exitTime, ease: "none", immediateRender: false }, start + duration - exitTime);
      }
    }
    var anims = Array.from(scene.querySelectorAll(".hf-anim"));
    var enter = Math.min(ENTER, duration / 4);
    var revealWindow = Math.max(0, duration - settle - exitTime - Math.min(0.8, duration * 0.3) - enter);
    anims.forEach(function (el, index) {
      var module = el.closest(".hf-module");
      var anchor = module.matches(".hf-ProductHero, .hf-Headline, .hf-OfferBadge") || (scene.dataset.role === "cta" && module.matches(".hf-CTA"));
      var at = start + settle + (anchor ? 0 : revealWindow * (index + 1) / Math.max(1, anims.length));
      var kind = el.dataset.anim || "fade";
      if (anchor && sceneIndex > 0) { tl.set(el, { autoAlpha: 1 }, start); return; }
      if (kind === "rise") tl.fromTo(el, { y: Math.min(48, Number(document.getElementById("hf-root").dataset.height) * 0.02), autoAlpha: anchor ? 0.35 : 0 }, { y: 0, autoAlpha: 1, duration: enter, ease: "power4.out" }, at);
      else if (kind === "scale") tl.fromTo(el, { scale: 0.94, autoAlpha: anchor ? 0.35 : 0 }, { scale: 1, autoAlpha: 1, duration: enter, ease: "power4.out" }, at);
      else tl.fromTo(el, { autoAlpha: anchor ? 0.35 : 0 }, { autoAlpha: 1, duration: enter, ease: "power4.out" }, at);
    });
    if (scene.dataset.motion === "staged_reveal") {
      var focal = scene.querySelector(scene.dataset.role === "cta" ? ".hf-CTA" : scene.dataset.role === "offer" ? ".hf-OfferBadge, .hf-Headline, .hf-Price" : ".hf-Headline");
      var words = focal ? Array.from(focal.querySelectorAll(".hf-word")) : [];
      words.forEach(function (word, index) {
        if (index === 0) { tl.set(word, { autoAlpha: 1 }, start); return; }
        var at = start + settle + revealWindow * index / Math.max(1, words.length - 1);
        tl.fromTo(word, { autoAlpha: 0 }, { autoAlpha: 1, duration: Math.min(0.2, enter), ease: "none" }, at);
      });
    }
    if (scene.dataset.motion === "product_push") {
      var image = scene.querySelector(".hf-ProductHero img");
      var cameraStart = start + settle + enter;
      var cameraTime = duration - settle - enter - exitTime;
      if (image && cameraTime > 0) tl.fromTo(image, { scale: 1 }, { scale: 1.08, duration: cameraTime, ease: "none" }, cameraStart);
    }
  });
  window.__timelines["${COMPOSITION_ID}"] = tl;
})();`;
}

function seamLedger(spec: CompositionSpec): object {
  const entries = sceneTimeline(spec);
  return {
    fps: spec.format.fps,
    seams: entries.slice(1).flatMap((entry, index) => {
      if (entry.transition === "cut") return [];
      const axis = entry.transition === "zoom" ? "z" : "x";
      const dir = axis === "z" ? 1 : -1;
      const duration = Math.min(0.3, entries[index]!.durationFrames / spec.format.fps / 4, entry.durationFrames / spec.format.fps / 4);
      return [{
        id: `${entries[index]!.id}_to_${entry.id}`,
        cut: entry.startFrames / spec.format.fps,
        technique: axis === "z" ? "zoom-through" : "cut-the-curve LEFT",
        exit: { selector: `#content-${entries[index]!.id}`, axis, dir, dur: duration },
        entry: { selector: `#content-${entry.id}`, axis, dir, dur: duration },
      }];
    }),
  };
}

function seconds(frames: number, fps: number): string {
  return String(frames / fps);
}

function indent(value: string, levels: number): string {
  const pad = "  ".repeat(levels);
  return value
    .split("\n")
    .map((line) => (line.length === 0 ? line : `${pad}${line}`))
    .join("\n");
}

function byPath<T extends { path: string }>(left: T, right: T): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

export { CompilerError };
