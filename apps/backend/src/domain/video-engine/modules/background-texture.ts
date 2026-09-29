import { GROUND_TONES, type GroundTone } from "../design-pack";
import type { VideoModule } from "./types";

/** A flat ground, because the pack forbids gradients, grids, and glow: colour-block contrast is the "texture". */
export const backgroundTexture: VideoModule = {
  id: "BackgroundTexture",
  version: "1.0.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: [{ name: "tone", required: false, kind: "token", maxLength: 16 }],
  build({ content }) {
    const requested = content.tone?.trim();
    const tone: GroundTone = GROUND_TONES.includes(requested as GroundTone) ? (requested as GroundTone) : "cream";
    const ink = tone === "ink" ? "var(--hf-cream)" : "var(--hf-ink)";
    return {
      html: `<div class="hf-BackgroundTexture hf-module" data-tone="${tone}"></div>`,
      css: `.hf-BackgroundTexture {
  position: absolute;
  inset: 0;
  background: var(--hf-${tone});
  border: var(--hf-border) solid ${ink};
  color: ${ink};
}`,
    };
  },
};
