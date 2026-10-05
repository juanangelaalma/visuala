import type { VideoModule } from "./types";

export const productHero: VideoModule = {
  id: "ProductHero",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [{ name: "assetId", required: true, kind: "asset" }],
};
