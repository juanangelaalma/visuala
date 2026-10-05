import type { VideoModule } from "./types";

export const brandMark: VideoModule = {
  id: "BrandMark",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [{ name: "text", required: true, kind: "text", maxLength: 40 }],
};
