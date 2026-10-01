import { escapeHtml } from "../html";
import { requireAsset } from "./support";
import type { VideoModule } from "./types";

export const productHero: VideoModule = {
  id: "ProductHero",
  version: "1.2.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [{ name: "assetId", required: true, kind: "asset" }],
  build({ content, assets }) {
    const asset = requireAsset("ProductHero", assets, content.assetId);
    return {
      html: `<figure class="hf-ProductHero hf-module" data-zone="product">
  <div class="hf-ProductHero__visual hf-anim" data-anim="scale">
    <img class="hf-ProductHero__image" src="assets/${escapeHtml(asset.fileName)}" alt="">
  </div>
</figure>`,
      css: `.hf-ProductHero {
  display: grid;
  place-items: center;
  margin: 0;
}

.hf-ProductHero__visual {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: transparent;
}

.hf-ProductHero__image {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
}`,
    };
  },
};
