import { escapeHtml } from "./escape-html";
import { sceneTiming } from "./scene-timing";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

export const galleryReveal: RenderTemplate = {
  id: "gallery-reveal",
  version: "1.0.0",
  supports: ["product_promo", "product_launch"],
  aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const sceneId = `scene-${scene.order}`;
      return [
        `      <div id="${sceneId}" class="scene gallery-scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}">`,
        `        <div class="gallery-ground"></div>`,
        `        <div id="${sceneId}-aperture" class="gallery-aperture">`,
        asset ? `          <img class="gallery-image" src="assets/${asset.fileName}" alt="" />` : "",
        `        </div>`,
        `        <div class="gallery-copy">`,
        `          <h1 id="${sceneId}-title">${escapeHtml(scene.onScreenTitle)}</h1>`,
        `          <p id="${sceneId}-body">${escapeHtml(scene.onScreenCopy)}</p>`,
        scene.caption ? `          <p class="caption">${escapeHtml(scene.caption)}</p>` : "",
        index === manifest.scenes.length - 1 && manifest.callToAction
          ? `          <p class="gallery-cta">${escapeHtml(manifest.callToAction)}</p>`
          : "",
        `        </div>`,
        `      </div>`,
      ].filter(Boolean).join("\n");
    });

    const timeline = manifest.scenes.map((scene, index) => {
      const sceneId = `scene-${scene.order}`;
      const duration = round(scene.endSeconds - scene.startSeconds);
      const timing = sceneTiming(duration, stylePack.motion.enterSeconds);
      if (timing.enter === 0) return "";
      const immediateRender = index === 0 ? "" : ", immediateRender: false";
      const phase = timing.enter / 2;
      const titleAt = round(scene.startSeconds + phase);
      const lines = [
        `tl.fromTo("#${sceneId}-aperture", { clipPath: "inset(46% 46% 46% 46% round ${px(manifest, 32)})" }, { clipPath: "inset(0% 0% 0% 0% round ${px(manifest, 32)})", duration: ${round(phase)}, ease: "power3.out"${immediateRender} }, ${scene.startSeconds});`,
        `tl.fromTo("#${sceneId} .gallery-image", { scale: 1.035 }, { scale: 1, duration: ${round(phase)}, ease: "power3.out"${immediateRender} }, ${scene.startSeconds});`,
        `tl.fromTo("#${sceneId}-title", { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: ${round(phase)}, ease: "power3.out"${immediateRender} }, ${titleAt});`,
        `tl.fromTo("#${sceneId}-body", { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: ${round(phase)}, ease: "power3.out"${immediateRender} }, ${titleAt});`,
      ];
      if (index < manifest.scenes.length - 1 && timing.exit > 0) {
        lines.push(`tl.to("#${sceneId} .gallery-image", { scale: 0.965, duration: ${round(timing.exit)}, ease: "power3.in" }, ${round(scene.endSeconds - timing.exit)});`);
      }
      return lines.join("\n");
    }).filter(Boolean).join("\n");

    return {
      html: document(manifest, scenes.join("\n"), timeline),
      css: galleryStyles(stylePack, manifest),
    };
  },
};

function document(manifest: RenderManifest, scenes: string, timeline: string): string {
  return `<!doctype html>
<html lang="${escapeHtml(manifest.language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${manifest.width}, height=${manifest.height}" />
    <link rel="stylesheet" href="./styles.css" />
    <script src="./vendor/gsap.min.js"></script>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${manifest.durationSeconds}"
         data-width="${manifest.width}" data-height="${manifest.height}">
${scenes}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${timeline}
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}

function galleryStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `${baseStyles(stylePack, manifest)}

.gallery-scene { overflow: hidden; isolation: isolate; clip-path: inset(0); }
.gallery-ground { position: absolute; inset: 0; background: var(--background); }
.gallery-aperture { position: absolute; top: var(--safe); right: var(--safe); bottom: 34%; left: var(--safe); overflow: hidden; border-radius: ${px(manifest, 32)}; background: var(--surface); }
.gallery-image { width: 100%; height: 100%; object-fit: contain; }
.gallery-copy { position: absolute; top: calc(66% + var(--safe)); right: var(--safe); bottom: var(--safe); left: var(--safe); display: flex; flex-direction: column; gap: ${px(manifest, 18)}; }
.gallery-copy h1 { font-size: ${px(manifest, galleryTitleSize(manifest))}; line-height: 1.05; overflow-wrap: anywhere; }
.gallery-copy p { font-size: ${px(manifest, galleryCopySize(manifest))}; line-height: 1.2; overflow-wrap: anywhere; }
${galleryLayout(manifest)}
`;
}

function galleryLayout(manifest: RenderManifest): string {
  if (manifest.aspectRatio === "16:9") return `.gallery-aperture { top: var(--safe); right: 42%; bottom: var(--safe); left: var(--safe); }
.gallery-copy { top: var(--safe); right: var(--safe); bottom: var(--safe); left: 62%; justify-content: center; }`;
  if (manifest.aspectRatio === "1:1") return `.gallery-aperture { bottom: 42%; }
.gallery-copy { top: calc(58% + var(--safe)); }`;
  return "";
}

function galleryTitleSize(manifest: RenderManifest): number {
  return manifest.aspectRatio === "16:9" ? 38 : manifest.aspectRatio === "1:1" ? 44 : 48;
}

function galleryCopySize(manifest: RenderManifest): number {
  return manifest.aspectRatio === "16:9" ? 26 : manifest.aspectRatio === "1:1" ? 30 : 34;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
