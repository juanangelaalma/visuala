import type { VideoModule } from "./types";

export const supportingCopy: VideoModule = {
  id: "SupportingCopy",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [{ name: "text", required: true, kind: "text", maxLength: 120 }],
};
