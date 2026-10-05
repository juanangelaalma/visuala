import type { VideoModule } from "./types";

export const backgroundTexture: VideoModule = {
  id: "BackgroundTexture",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [{ name: "tone", required: false, kind: "token", maxLength: 16 }],
};
