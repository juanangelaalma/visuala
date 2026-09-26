import { escapeHtml } from "./escape-html";
import { sceneTiming } from "./scene-timing";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

export const kineticType: RenderTemplate = {
  id: "kinetic-type",
  version: "1.0.0",
  supports: ["product_launch"],
  aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const scenes = manifest.scenes.map((scene, index) => {
      const sceneId = `scene-${scene.order}`;
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const words = wordGroups(scene.onScreenTitle).map((group, groupIndex) =>
        `<span id="${sceneId}-word-${groupIndex}" class="kinetic-word">${escapeHtml(group)}</span>`,
      ).join(" ");
      return `<div id="${sceneId}" class="scene kinetic-scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}">
  <div class="kinetic-media">${asset ? `<img src="assets/${asset.fileName}" alt="" />` : ""}</div>
  <div class="kinetic-copy"><h1>${words}</h1><div id="${sceneId}-accent" class="kinetic-accent"></div><p>${escapeHtml(scene.onScreenCopy)}</p>${scene.caption ? `<p class="caption">${escapeHtml(scene.caption)}</p>` : ""}</div>
</div>`;
    });
    const timeline = manifest.scenes.flatMap((scene, index) => {
      const timing = sceneTiming(scene.endSeconds - scene.startSeconds, stylePack.motion.enterSeconds);
      if (timing.enter === 0) return [];
      const immediate = index === 0 ? "" : ", immediateRender: false";
      const groups = wordGroups(scene.onScreenTitle);
      const groupStagger = timing.enter / Math.max(1, groups.length);
      const lines = groups.map((_, groupIndex) => `tl.fromTo("#scene-${scene.order}-word-${groupIndex}", { y: "${px(manifest, 72)}", opacity: 0 }, { y: 0, opacity: 1, duration: ${round(timing.enter - groupStagger * groupIndex)}, ease: "power4.out"${immediate} }, ${round(scene.startSeconds + groupStagger * groupIndex)});`);
      lines.push(`tl.fromTo("#scene-${scene.order}-accent", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: ${round(groupStagger)}, ease: "power4.out"${immediate} }, ${round(scene.startSeconds + timing.enter - groupStagger)});`);
      return lines;
    }).join("\n");
    return { html: document(manifest, scenes.join("\n"), timeline), css: styles(stylePack, manifest) };
  },
};

function wordGroups(title: string): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const size = Math.max(1, Math.ceil(words.length / 4));
  return Array.from({ length: Math.min(4, Math.ceil(words.length / size)) }, (_, index) => words.slice(index * size, (index + 1) * size).join(" "));
}

function document(manifest: RenderManifest, scenes: string, timeline: string): string {
  return `<!doctype html><html lang="${escapeHtml(manifest.language)}"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${manifest.width}, height=${manifest.height}" /><link rel="stylesheet" href="./styles.css" /><script src="./vendor/gsap.min.js"></script></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${manifest.durationSeconds}" data-width="${manifest.width}" data-height="${manifest.height}">${scenes}</div><script>const tl = gsap.timeline({ paused: true });\n${timeline}\nwindow.__timelines = window.__timelines || {}; window.__timelines["main"] = tl; tl.seek(0);</script></body></html>`;
}

function styles(stylePack: StylePack, manifest: RenderManifest): string {
  return `${baseStyles(stylePack, manifest)}
.kinetic-scene { overflow: hidden; isolation: isolate; clip-path: inset(0); background: var(--background); }
.kinetic-media { position: absolute; right: var(--safe); bottom: var(--safe); width: 38%; height: 34%; overflow: hidden; border-radius: ${px(manifest, 28)}; background: var(--surface); }
.kinetic-media img { width: 100%; height: 100%; object-fit: cover; }
.kinetic-copy { position: absolute; top: var(--safe); right: var(--safe); left: var(--safe); min-height: 60%; display: flex; flex-direction: column; justify-content: center; gap: ${px(manifest, 24)}; }
.kinetic-copy h1 { display: flex; flex-wrap: wrap; gap: 0 ${px(manifest, 24)}; font-size: clamp(${px(manifest, 72)}, 9vw, ${px(manifest, 150)}); overflow-wrap: anywhere; }
.kinetic-word { display: inline-block; }
.kinetic-accent { width: 32%; height: ${px(manifest, 8)}; background: var(--accent); }
.kinetic-copy p { max-width: 62%; overflow-wrap: anywhere; }`;
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }
