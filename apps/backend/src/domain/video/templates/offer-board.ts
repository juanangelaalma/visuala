import { escapeHtml } from "./escape-html";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

/**
 * A price-led template. The offer plate is pinned for the whole video rather than shown for one
 * scene, so a discount or a menu price is on screen from the first frame to the last, and the product
 * image sits in a framed card instead of bleeding to the edge. Menu rows render when the brief has
 * them, which is what makes `menu_showcase` work with the same template as `discount_promo`.
 */
export const offerBoard: RenderTemplate = {
  id: "offer-board",
  version: "1.0.0",
  supports: ["discount_promo", "menu_showcase"],
  aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const offerLabel = manifest.menuItems.length > 0
      ? manifest.menuItems.map((item) => (item.price ? `${item.name} · ${item.price}` : item.name)).join("  ·  ")
      : manifest.callToAction ?? manifest.keyMessage;

    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const sceneId = `scene-${scene.order}`;
      return [
        `      <div id="${sceneId}" class="scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}">`,
        `        <div class="card">`,
        asset ? `          <img class="scene-image" src="assets/${asset.fileName}" alt="" />` : "",
        `          <div class="card-copy">`,
        `            <h1 id="${sceneId}-title">${escapeHtml(scene.onScreenTitle)}</h1>`,
        `            <p id="${sceneId}-copy">${escapeHtml(scene.onScreenCopy)}</p>`,
        scene.caption ? `            <p id="${sceneId}-caption" class="caption">${escapeHtml(scene.caption)}</p>` : "",
        `          </div>`,
        `        </div>`,
        `      </div>`,
      ].filter(Boolean).join("\n");
    });

    // The plate sits on its own track above every scene, and in its own layer, so no scene transition
    // can take the price off screen.
    const plate = `      <div class="scene plate-layer clip" data-start="0" data-duration="${manifest.durationSeconds}" data-track-index="90">
        <div class="plate">
          <span class="brand">${escapeHtml(manifest.brandName ?? manifest.productName)}</span>
          <span class="offer">${escapeHtml(offerLabel)}</span>
        </div>
      </div>`;

    const timeline = manifest.scenes.map((scene, index) => {
      const sceneId = `scene-${scene.order}`;
      const at = round(scene.startSeconds + index * 0.05);
      return [
        `tl.fromTo("#${sceneId} .card", { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: ${stylePack.motion.enterSeconds} }, ${at});`,
        `tl.fromTo("#${sceneId}-title", { opacity: 0 }, { opacity: 1, duration: ${stylePack.motion.enterSeconds} }, ${round(at + 0.15)});`,
      ].join("\n");
    }).join("\n");

    const html = `<!doctype html>
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
${plate}
${scenes.join("\n")}
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

    return { html, css: boardStyles(stylePack, manifest) };
  },
};

function boardStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `${baseStyles(stylePack, manifest)}

.plate-layer { z-index: 50; }

.plate {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: ${px(manifest, 6)};
  padding: ${px(manifest, 48)} var(--safe);
  background: var(--surface);
}

.plate .brand { color: var(--ink); font-weight: 700; font-size: ${px(manifest, 34)}; }

.plate .offer {
  color: var(--accent-ink);
  background: var(--accent);
  align-self: flex-start;
  padding: ${px(manifest, 10)} ${px(manifest, 20)};
  font-weight: 800;
  font-size: ${px(manifest, 46)};
}

.card {
  position: absolute;
  left: var(--safe);
  right: var(--safe);
  top: ${px(manifest, 260)};
  bottom: var(--safe);
  display: flex;
  flex-direction: column;
  gap: ${px(manifest, 28)};
}

.scene-image {
  flex: 1;
  width: 100%;
  min-height: 0;
  object-fit: cover;
  border-radius: ${px(manifest, 32)};
  outline: ${px(manifest, 2)} solid var(--accent);
}

.card-copy { display: flex; flex-direction: column; gap: ${px(manifest, 16)}; }
`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
