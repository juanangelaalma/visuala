import { escapeHtml } from "./escape-html";
import { sceneTiming } from "./scene-timing";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

export const artisanDetail: RenderTemplate = {
  id: "artisan-detail", version: "1.0.0", supports: ["product_promo", "product_launch"], aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      return `<div id="scene-${scene.order}" class="scene artisan-scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}"><div class="artisan-image">${asset ? `<img src="assets/${asset.fileName}" alt="" />` : ""}</div><div class="artisan-notes"><h1 id="scene-${scene.order}-title">${escapeHtml(scene.onScreenTitle)}</h1><div id="scene-${scene.order}-line" class="artisan-line"></div><p id="scene-${scene.order}-copy">${escapeHtml(scene.onScreenCopy)}</p>${scene.caption ? `<p class="caption">${escapeHtml(scene.caption)}</p>` : ""}</div></div>`;
    });
    const timeline = manifest.scenes.flatMap((scene, index) => {
      const timing = sceneTiming(scene.endSeconds - scene.startSeconds, stylePack.motion.enterSeconds);
      if (!timing.enter) return [];
      const immediate = index ? ", immediateRender: false" : "";
      const at = scene.startSeconds;
      return [`tl.fromTo("#scene-${scene.order} .artisan-image img", { xPercent: -2 }, { xPercent: 0, duration: ${round(timing.enter)}, ease: "power2.out"${immediate} }, ${at});`, `tl.fromTo("#scene-${scene.order}-title", { y: "${px(manifest, 28)}", opacity: 0 }, { y: 0, opacity: 1, duration: ${round(timing.enter)}, ease: "power3.out"${immediate} }, ${at});`, `tl.fromTo("#scene-${scene.order}-line", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: ${round(timing.enter - timing.stagger)}, ease: "power3.out"${immediate} }, ${round(at + timing.stagger)});`, `tl.fromTo("#scene-${scene.order}-copy", { y: "${px(manifest, 28)}", opacity: 0 }, { y: 0, opacity: 1, duration: ${round(timing.enter - timing.stagger * 2)}, ease: "power3.out"${immediate} }, ${round(at + timing.stagger * 2)});`];
    }).join("\n");
    return { html: document(manifest, scenes.join("\n"), timeline), css: styles(stylePack, manifest) };
  },
};

function document(manifest: RenderManifest, scenes: string, timeline: string): string { return `<!doctype html><html lang="${escapeHtml(manifest.language)}"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${manifest.width}, height=${manifest.height}" /><link rel="stylesheet" href="./styles.css" /><script src="./vendor/gsap.min.js"></script></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${manifest.durationSeconds}" data-width="${manifest.width}" data-height="${manifest.height}">${scenes}</div><script>const tl = gsap.timeline({ paused: true });\n${timeline}\nwindow.__timelines = window.__timelines || {}; window.__timelines["main"] = tl; tl.seek(0);</script></body></html>`; }
function styles(stylePack: StylePack, manifest: RenderManifest): string { const portrait = manifest.aspectRatio === "9:16"; return `${baseStyles(stylePack, manifest)}
.artisan-scene { overflow: hidden; isolation: isolate; clip-path: inset(0); background: var(--background); }
.artisan-image { position: absolute; overflow: hidden; background: var(--surface); ${portrait ? "top: 0; right: 0; left: 0; height: 65%;" : "top: 0; bottom: 0; left: 0; width: 65%;"} }
.artisan-image img { width: 102%; height: 100%; object-fit: cover; }
.artisan-notes { position: absolute; display: flex; flex-direction: column; justify-content: center; gap: ${px(manifest, 24)}; padding: var(--safe); background: var(--surface); ${portrait ? "right: 0; bottom: 0; left: 0; height: 35%;" : "top: 0; right: 0; bottom: 0; width: 35%;"} }
.artisan-notes h1, .artisan-notes p { overflow-wrap: anywhere; }
.artisan-line { width: 100%; height: ${px(manifest, 3)}; background: var(--accent); }`; }
function round(value: number): number { return Math.round(value * 1000) / 1000; }
