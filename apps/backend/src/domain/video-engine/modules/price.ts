import type { VideoModule } from "./types";

export const price: VideoModule = {
  id: "Price",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [
    { name: "value", required: true, kind: "text", maxLength: 16 },
    { name: "label", required: false, kind: "text", maxLength: 24 },
  ],
};
