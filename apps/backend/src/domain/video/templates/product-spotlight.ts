import { escapeHtml } from "./escape-html";
import { baseStyles, px } from "./styles";
import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";
import type { RenderTemplate } from "./registry";

/**
 * One asset-led scene per storyboard scene: the image fills the frame, the title sits above the copy
 * and the caption, all inside the design system's safe area. The variant seed moves the text block
 * between three fixed positions and nothing else, so variation can never move a commercial fact off
 * the safe area or change the running order.
 */
export const productSpotlight: RenderTemplate = {
  id: "product-spotlight",
  version: "1.0.0",
  supports: ["product_promo", "product_launch"],
  aspectRatios: ["9:16", "1:1", "16:9"],
  build({ manifest, stylePack }) {
    const textAnchors = ["center", "lower", "upper"] as const;
    const scenes = manifest.scenes.map((scene, index) => {
      const asset = manifest.assets.find((candidate) => scene.assetIds.includes(candidate.assetId));
      const anchor = textAnchors[index % textAnchors.length] ?? "center";
      const sceneId = `scene-${scene.order}`;
      return [
        `      <div id="${sceneId}" class="scene clip" data-start="${scene.startSeconds}" data-duration="${round(scene.endSeconds - scene.startSeconds)}" data-track-index="${index}">`,
        asset ? `        <img class="scene-image" src="assets/${asset.fileName}" alt="" />` : "",
        `        <div class="scrim"></div>`,
        `        <div class="copy ${anchor}">`,
        `          <h1 id="${sceneId}-title">${escapeHtml(scene.onScreenTitle)}</h1>`,
        `          <p id="${sceneId}-copy">${escapeHtml(scene.onScreenCopy)}</p>`,
        scene.caption ? `          <p id="${sceneId}-caption" class="caption">${escapeHtml(scene.caption)}</p>` : "",
        manifest.callToAction ? `          <p class="cta">${escapeHtml(manifest.callToAction)}</p>` : "",
        `        </div>`,
        `      </div>`,
      ].filter(Boolean).join("\n");
    });

    // Selectors are generated from scene order only; no user text is ever interpolated into a script.
    const timeline = manifest.scenes.map((scene, index) => {
      const sceneId = `scene-${scene.order}`;
      const at = round(scene.startSeconds + index * 0.05);
      return `tl.fromTo("#${sceneId}-title", { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: ${stylePack.motion.enterSeconds} }, ${at});`;
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

    return { html, css: sceneStyles(stylePack, manifest) };
  },
};

function sceneStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `${baseStyles(stylePack, manifest)}

.scene-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

/* The scrim is what keeps the approved copy legible over an arbitrary user photo, so it belongs to
   the template rather than being something a style pack can omit. */
.scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.72) 100%);
}

.copy {
  position: absolute;
  left: var(--safe);
  right: var(--safe);
  display: flex;
  flex-direction: column;
  gap: ${px(manifest, 18)};
}

.copy.center { top: 50%; transform: translateY(-50%); }
.copy.lower { bottom: var(--safe); }
.copy.upper { top: var(--safe); }

.cta {
  align-self: flex-start;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  padding: ${px(manifest, 14)} ${px(manifest, 28)};
  border-radius: 999px;
}
`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
