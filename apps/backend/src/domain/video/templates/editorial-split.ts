import { escapeHtml } from "./escape-html";
import { sceneTiming } from "./scene-timing";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

export const editorialSplit: RenderTemplate = {
  id: "editorial-split",
  version: "1.0.0",
  supports: ["product_promo", "product_launch"],
  aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const sceneId = `scene-${scene.order}`;
      return [
        `      <div id="${sceneId}" class="scene editorial-scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}">`,
        `        <div class="editorial-ground"></div>`,
        `        <div class="editorial-media">`,
        asset ? `          <img class="editorial-image" src="assets/${asset.fileName}" alt="" />` : "",
        `        </div>`,
        `        <div id="${sceneId}-divider" class="editorial-divider"></div>`,
        `        <div class="editorial-copy">`,
        `          <h1 id="${sceneId}-title">${escapeHtml(scene.onScreenTitle)}</h1>`,
        `          <p id="${sceneId}-body">${escapeHtml(scene.onScreenCopy)}</p>`,
        scene.caption ? `          <p class="caption">${escapeHtml(scene.caption)}</p>` : "",
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
      const imageTravel = px(manifest, 86);
      const copyTravel = px(manifest, 32);
      return [
        `tl.fromTo("#${sceneId} .editorial-image", { x: "-${imageTravel}", opacity: 0 }, { x: 0, opacity: 1, duration: ${round(timing.enter)}, ease: "power3.out"${immediateRender} }, ${scene.startSeconds});`,
        `tl.fromTo("#${sceneId}-divider", { scaleY: 0, transformOrigin: "top center" }, { scaleY: 1, duration: ${round(timing.enter)}, ease: "power3.out"${immediateRender} }, ${scene.startSeconds});`,
        `tl.fromTo("#${sceneId}-title", { x: "${copyTravel}", opacity: 0 }, { x: 0, opacity: 1, duration: ${round(timing.enter - timing.stagger)}, ease: "power3.out"${immediateRender} }, ${round(scene.startSeconds + timing.stagger)});`,
        `tl.fromTo("#${sceneId}-body", { x: "${copyTravel}", opacity: 0 }, { x: 0, opacity: 1, duration: ${round(timing.enter - timing.stagger * 2)}, ease: "power3.out"${immediateRender} }, ${round(scene.startSeconds + timing.stagger * 2)});`,
      ].join("\n");
    }).filter(Boolean).join("\n");

    return {
      html: document(manifest, scenes.join("\n"), timeline),
      css: splitStyles(stylePack, manifest),
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

function splitStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `${baseStyles(stylePack, manifest)}

.editorial-scene { overflow: hidden; isolation: isolate; clip-path: inset(0); }
.editorial-ground { position: absolute; inset: 0; background: var(--background); }
${editorialLayout(manifest)}
.editorial-media { overflow: hidden; }
.editorial-image { width: 100%; height: 100%; object-fit: cover; }
.editorial-divider { background: var(--accent); }
.editorial-copy { display: flex; flex-direction: column; justify-content: center; gap: ${px(manifest, 24)}; padding: var(--safe); background: var(--surface); }
.editorial-copy h1 { font-size: ${editorialTitleSize(manifest)}; overflow-wrap: anywhere; word-break: normal; }
.editorial-copy p { overflow-wrap: anywhere; word-break: normal; }
`;
}

function editorialTitleSize(manifest: RenderManifest): string {
  if (manifest.aspectRatio === "9:16") return px(manifest, 44);
  if (manifest.aspectRatio === "16:9") return px(manifest, 56);
  return px(manifest, 48);
}

function editorialLayout(manifest: RenderManifest): string {
  if (manifest.aspectRatio === "9:16") {
    return `.editorial-media { position: absolute; top: 0; right: 0; left: 0; height: 55%; }
.editorial-divider { position: absolute; top: 55%; right: 0; left: 0; height: ${px(manifest, 8)}; }
.editorial-copy { position: absolute; right: 0; bottom: 0; left: 0; height: 45%; }`;
  }

  const mediaWidth = manifest.aspectRatio === "16:9" ? 58 : 52;
  const copyWidth = 100 - mediaWidth;
  return `.editorial-media { position: absolute; top: 0; bottom: 0; left: 0; width: ${mediaWidth}%; }
.editorial-divider { position: absolute; top: 0; bottom: 0; left: ${mediaWidth}%; width: ${px(manifest, 8)}; }
.editorial-copy { position: absolute; top: 0; right: 0; bottom: 0; width: ${copyWidth}%; }`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
