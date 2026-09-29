import type { RecipeAspectRatio } from "./recipes/types";

export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

/** The named resolution is the frame's short side; a 720p render is the same layout at a smaller frame. */
export function frameSizeFor(aspectRatio: RecipeAspectRatio, resolution: VideoResolution): { width: number; height: number } {
  const shortSide = resolution === "1080p" ? 1080 : 720;
  switch (aspectRatio) {
    case "9:16":
      return { width: shortSide, height: (shortSide * 16) / 9 };
    case "1:1":
      return { width: shortSide, height: shortSide };
    case "16:9":
      return { width: (shortSide * 16) / 9, height: shortSide };
  }
}
