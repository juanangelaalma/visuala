import { VIDEO_STYLE_IDS } from "./settings";
import type { VideoStyleId } from "./types";

export type StylePalette = {
  background: string;
  surface: string;
  ink: string;
  accent: string;
  accentInk: string;
};

export type StylePack = {
  id: VideoStyleId;
  version: string;
  palette: StylePalette;
  typography: {
    displayFamily: string;
    bodyFamily: string;
    displayWeight: number;
    titleSize: string;
    copySize: string;
  };
  motion: { energy: "calm" | "brisk" | "punchy"; enterSeconds: number };
  captionTreatment: "boxed" | "underline" | "plain";
};

/**
 * A style pack is the visual language shared across templates. It is frozen and versioned because a
 * `video_versions` row names the pack version it rendered with: changing a pack changes the frames a
 * rerender produces, and the version record is what makes that traceable rather than silent.
 *
 * Inter is resolved from the producer's bundled @fontsource faces; no pack may name a network font.
 */
export const STYLE_PACKS: Readonly<Record<VideoStyleId, StylePack>> = Object.freeze({
  bold_pop: Object.freeze({
    id: "bold_pop",
    version: "1.0.0",
    palette: Object.freeze({ background: "#050505", surface: "#111111", ink: "#f8f8f5", accent: "#eff31b", accentInk: "#050505" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 800, titleSize: "96px", copySize: "44px" }),
    motion: Object.freeze({ energy: "punchy" as const, enterSeconds: 0.45 }),
    captionTreatment: "boxed" as const,
  }),
  clean_product: Object.freeze({
    id: "clean_product",
    version: "1.0.0",
    palette: Object.freeze({ background: "#f3f3ef", surface: "#ffffff", ink: "#14181c", accent: "#b9c4cc", accentInk: "#14181c" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 600, titleSize: "88px", copySize: "40px" }),
    motion: Object.freeze({ energy: "calm" as const, enterSeconds: 0.6 }),
    captionTreatment: "plain" as const,
  }),
  warm_artisan: Object.freeze({
    id: "warm_artisan",
    version: "1.0.0",
    palette: Object.freeze({ background: "#5b2e1b", surface: "#7a4227", ink: "#fdf3e7", accent: "#d99a62", accentInk: "#3a1c0f" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 700, titleSize: "92px", copySize: "42px" }),
    motion: Object.freeze({ energy: "calm" as const, enterSeconds: 0.7 }),
    captionTreatment: "underline" as const,
  }),
  premium_dark: Object.freeze({
    id: "premium_dark",
    version: "1.0.0",
    palette: Object.freeze({ background: "#171717", surface: "#232323", ink: "#f4f1ea", accent: "#d7c39a", accentInk: "#171717" }),
    typography: Object.freeze({ displayFamily: "Inter", bodyFamily: "Inter", displayWeight: 500, titleSize: "84px", copySize: "38px" }),
    motion: Object.freeze({ energy: "brisk" as const, enterSeconds: 0.55 }),
    captionTreatment: "plain" as const,
  }),
});

export function stylePackFor(id: VideoStyleId): StylePack {
  const pack = STYLE_PACKS[id];
  if (!pack) throw new Error(`No style pack for ${id}.`);
  return pack;
}
