import type { RenderManifest } from "../render-manifest";
import type { StylePack } from "../style-packs";

/**
 * The design system is authored at a 1080 short side, so text is scaled off the frame's short side:
 * a 720p render is the same layout at a smaller frame, never a shrunken 1080p composition.
 */
export function styleScale(manifest: RenderManifest): number {
  return Math.min(manifest.width, manifest.height) / 1080;
}

export function px(manifest: RenderManifest, value: number): string {
  return `${Math.round(value * styleScale(manifest))}px`;
}

export function safeArea(manifest: RenderManifest): number {
  return Math.round(Math.min(manifest.width, manifest.height) * 0.08);
}

/** The tokens and the reset both templates share; each template appends only its own layout rules. */
export function baseStyles(stylePack: StylePack, manifest: RenderManifest): string {
  return `:root {
  --background: ${stylePack.palette.background};
  --surface: ${stylePack.palette.surface};
  --ink: ${stylePack.palette.ink};
  --accent: ${stylePack.palette.accent};
  --accent-ink: ${stylePack.palette.accentInk};
  --safe: ${safeArea(manifest)}px;
  --title-size: ${stylePack.typography.titleSize};
  --copy-size: ${stylePack.typography.copySize};
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: ${manifest.width}px;
  height: ${manifest.height}px;
  overflow: hidden;
  background: var(--background);
  font-family: "${stylePack.typography.bodyFamily}", system-ui, sans-serif;
}

#root { position: relative; width: ${manifest.width}px; height: ${manifest.height}px; overflow: hidden; }

.scene { position: absolute; inset: 0; }

h1 {
  color: var(--ink);
  font-family: "${stylePack.typography.displayFamily}", system-ui, sans-serif;
  font-weight: ${stylePack.typography.displayWeight};
  font-size: var(--title-size);
  line-height: 1.05;
  letter-spacing: -0.02em;
}

p { color: var(--ink); font-size: var(--copy-size); line-height: 1.3; }

${captionStyles(stylePack)}
`;
}

function captionStyles(stylePack: StylePack): string {
  switch (stylePack.captionTreatment) {
    case "boxed":
      return ".caption { display: inline-block; align-self: flex-start; background: var(--surface); padding: 8px 16px; }";
    case "underline":
      return ".caption { display: inline-block; align-self: flex-start; border-bottom: 4px solid var(--accent); padding-bottom: 6px; }";
    case "plain":
      return ".caption { display: block; opacity: 0.92; }";
  }
}
