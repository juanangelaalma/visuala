import { escapeHtml } from "./escape-html";
import { sceneTiming } from "./scene-timing";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

export const offerTakeover: RenderTemplate = {
  id: "offer-takeover", version: "1.0.0", supports: ["discount_promo"], aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const offer = manifest.menuItems.map((item) => item.price).find(Boolean) ?? manifest.keyMessage;
    const rail = `<div class="scene offer-rail-layer clip" data-start="0" data-duration="${manifest.durationSeconds}" data-track-index="90"><div class="offer-rail"><span>${escapeHtml(manifest.brandName ?? manifest.productName)}</span><strong>${escapeHtml(offer)}</strong>${manifest.callToAction ? `<span>${escapeHtml(manifest.callToAction)}</span>` : ""}</div></div>`;
    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      return `<div id="scene-${scene.order}" class="scene takeover-scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}"><div id="scene-${scene.order}-offer" class="takeover-offer">${escapeHtml(offer)}</div><div class="takeover-copy"><h1>${escapeHtml(scene.onScreenTitle)}</h1><p>${escapeHtml(scene.onScreenCopy)}</p>${scene.caption ? `<p class="caption">${escapeHtml(scene.caption)}</p>` : ""}</div><div class="takeover-media">${asset ? `<img src="assets/${asset.fileName}" alt="" />` : ""}</div></div>`;
    });
    const timeline = manifest.scenes.flatMap((scene, index) => {
      const timing = sceneTiming(scene.endSeconds - scene.startSeconds, stylePack.motion.enterSeconds);
      if (!timing.enter) return [];
      const immediate = index ? ", immediateRender: false" : "";
      return [`tl.fromTo("#scene-${scene.order}-offer", { scale: 0.96, opacity: 0 }, { scale: 1, opacity: 1, duration: ${round(timing.enter)}, ease: "power3.out"${immediate} }, ${scene.startSeconds});`, `tl.fromTo("#scene-${scene.order} .takeover-media", { x: "${px(manifest, 48)}", opacity: 0 }, { x: 0, opacity: 1, duration: ${round(timing.enter)}, ease: "power3.out"${immediate} }, ${round(scene.startSeconds + timing.stagger)});`];
    }).join("\n");
    return { html: document(manifest, `${rail}\n${scenes.join("\n")}`, timeline), css: styles(stylePack, manifest) };
  },
};

function document(manifest: RenderManifest, scenes: string, timeline: string): string { return `<!doctype html><html lang="${escapeHtml(manifest.language)}"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${manifest.width}, height=${manifest.height}" /><link rel="stylesheet" href="./styles.css" /><script src="./vendor/gsap.min.js"></script></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${manifest.durationSeconds}" data-width="${manifest.width}" data-height="${manifest.height}">${scenes}</div><script>const tl = gsap.timeline({ paused: true });\n${timeline}\nwindow.__timelines = window.__timelines || {}; window.__timelines["main"] = tl; tl.seek(0);</script></body></html>`; }
function styles(stylePack: StylePack, manifest: RenderManifest): string { return `${baseStyles(stylePack, manifest)}
.takeover-scene { overflow: hidden; isolation: isolate; clip-path: inset(0); background: var(--background); padding: var(--safe); }
.takeover-offer { position: absolute; top: 12%; right: var(--safe); left: var(--safe); color: var(--accent); font-family: "${stylePack.typography.displayFamily}", system-ui, sans-serif; font-size: clamp(${px(manifest, 100)}, 16vw, ${px(manifest, 230)}); font-weight: ${stylePack.typography.displayWeight}; line-height: .88; overflow-wrap: anywhere; }
.takeover-copy { position: absolute; right: var(--safe); bottom: 16%; left: var(--safe); max-width: 62%; display: flex; flex-direction: column; gap: ${px(manifest, 18)}; }
.takeover-copy h1, .takeover-copy p { overflow-wrap: anywhere; }
.takeover-media { position: absolute; right: var(--safe); bottom: 18%; width: 32%; height: 28%; overflow: hidden; background: var(--surface); border-radius: ${px(manifest, 24)}; }
.takeover-media img { width: 100%; height: 100%; object-fit: cover; }
.offer-rail-layer { z-index: 50; pointer-events: none; }
.offer-rail { position: absolute; right: 0; bottom: 0; left: 0; min-height: 10%; display: flex; align-items: center; justify-content: space-between; gap: ${px(manifest, 20)}; padding: ${px(manifest, 22)} var(--safe); background: var(--accent); color: var(--accent-ink); font-size: ${px(manifest, 28)}; }
.offer-rail strong { font-size: ${px(manifest, 38)}; overflow-wrap: anywhere; }`; }
function round(value: number): number { return Math.round(value * 1000) / 1000; }
