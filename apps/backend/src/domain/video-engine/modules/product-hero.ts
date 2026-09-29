import { escapeHtml } from "../html";
import { requireAsset } from "./support";
import type { VideoModule } from "./types";

export const productHero: VideoModule = {
  id: "ProductHero",
  version: "1.0.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [{ name: "assetId", required: true, kind: "asset" }],
  build({ content, assets }) {
    const asset = requireAsset("ProductHero", assets, content.assetId);
    return {
      html: `<figure class="hf-ProductHero hf-module hf-anim" data-anim="scale">
  <img class="hf-ProductHero__image" src="assets/${escapeHtml(asset.fileName)}" alt="">
</figure>`,
      css: `.hf-ProductHero {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: var(--hf-border) solid var(--hf-ink);
  background: var(--hf-cream2);
}

.hf-ProductHero__image { width: 100%; height: 100%; object-fit: cover; display: block; }`,
    };
  },
};
