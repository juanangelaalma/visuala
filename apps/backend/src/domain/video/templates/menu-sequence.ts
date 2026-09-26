import { escapeHtml } from "./escape-html";
import { sceneTiming } from "./scene-timing";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

export const menuSequence: RenderTemplate = {
  id: "menu-sequence", version: "1.0.0", supports: ["menu_showcase"], aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const rows = manifest.menuItems.length ? manifest.menuItems.map((item, row) => `<div id="scene-${scene.order}-row-${row}" class="menu-row"><span>${escapeHtml(item.name)}</span>${item.price ? `<span class="menu-price">${escapeHtml(item.price)}</span>` : ""}</div>`).join("") : `<div id="scene-${scene.order}-row-0" class="menu-fallback"><h1>${escapeHtml(scene.onScreenTitle)}</h1><p>${escapeHtml(scene.onScreenCopy)}</p></div>`;
      return `<div id="scene-${scene.order}" class="scene menu-scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}"><div class="menu-media">${asset ? `<img src="assets/${asset.fileName}" alt="" />` : ""}</div><div class="menu-list">${rows}${scene.caption ? `<p class="caption">${escapeHtml(scene.caption)}</p>` : ""}</div></div>`;
    });
    const timeline = manifest.scenes.flatMap((scene, index) => {
      const timing = sceneTiming(scene.endSeconds - scene.startSeconds, stylePack.motion.enterSeconds);
      if (!timing.enter) return [];
      const immediate = index ? ", immediateRender: false" : "";
      const rowCount = Math.max(1, manifest.menuItems.length);
      const rowStagger = timing.enter / Math.max(1, rowCount);
      const lines = [`tl.fromTo("#scene-${scene.order} .menu-media", { x: "${px(manifest, 52)}", opacity: 0 }, { x: 0, opacity: 1, duration: ${round(timing.enter)}, ease: "power3.out"${immediate} }, ${scene.startSeconds});`];
      for (let row = 0; row < rowCount; row += 1) lines.push(`tl.fromTo("#scene-${scene.order}-row-${row}", { y: "${px(manifest, 24)}", opacity: 0 }, { y: 0, opacity: 1, duration: ${round(timing.enter - rowStagger * row)}, ease: "power3.out"${immediate} }, ${round(scene.startSeconds + rowStagger * row)});`);
      return lines;
    }).join("\n");
    return { html: document(manifest, scenes.join("\n"), timeline), css: styles(stylePack, manifest) };
  },
};

function document(manifest: RenderManifest, scenes: string, timeline: string): string { return `<!doctype html><html lang="${escapeHtml(manifest.language)}"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${manifest.width}, height=${manifest.height}" /><link rel="stylesheet" href="./styles.css" /><script src="./vendor/gsap.min.js"></script></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${manifest.durationSeconds}" data-width="${manifest.width}" data-height="${manifest.height}">${scenes}</div><script>const tl = gsap.timeline({ paused: true });\n${timeline}\nwindow.__timelines = window.__timelines || {}; window.__timelines["main"] = tl; tl.seek(0);</script></body></html>`; }
function styles(stylePack: StylePack, manifest: RenderManifest): string { const portrait = manifest.aspectRatio === "9:16"; return `${baseStyles(stylePack, manifest)}
.menu-scene { overflow: hidden; isolation: isolate; clip-path: inset(0); background: var(--background); }
.menu-media { position: absolute; overflow: hidden; background: var(--surface); ${portrait ? "top: 0; right: 0; left: 0; height: 56%;" : "top: 0; right: 0; bottom: 0; width: 54%;"} }
.menu-media img { width: 100%; height: 100%; object-fit: cover; }
.menu-list { position: absolute; display: flex; flex-direction: column; justify-content: center; padding: var(--safe); ${portrait ? "right: 0; bottom: 0; left: 0; height: 44%;" : "top: 0; bottom: 0; left: 0; width: 46%;"} }
.menu-row { display: flex; justify-content: space-between; gap: ${px(manifest, 24)}; padding: ${px(manifest, 22)} 0; border-bottom: ${px(manifest, 2)} solid var(--accent); color: var(--ink); font-size: var(--copy-size); }
.menu-price { flex: none; font-weight: 700; }
.menu-fallback { display: flex; flex-direction: column; gap: ${px(manifest, 20)}; }
.menu-fallback h1, .menu-fallback p { overflow-wrap: anywhere; }`; }
function round(value: number): number { return Math.round(value * 1000) / 1000; }
