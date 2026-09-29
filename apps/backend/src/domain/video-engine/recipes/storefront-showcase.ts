import type { VideoRecipe } from "./types";

export const storefrontShowcase: VideoRecipe = {
  id: "storefront_showcase",
  version: "1.0.0",
  purpose: "Present a place or a storefront and tell the viewer how to reach it.",
  required: ["productName", "objective", "keyMessage", "orderDestination"],
  beats: [
    { id: "establish", intent: "establish the place with the strongest available asset" },
    { id: "highlight", intent: "highlight what makes it worth a visit" },
    { id: "visit", intent: "close on how to reach the place" },
  ],
  recommendedModules: ["ProductHero", "BrandMark", "SupportingCopy", "CTA", "BackgroundTexture"],
  defaultDurationSeconds: 10,
  defaultAspectRatio: "9:16",
  constraints: [
    "The destination text may only repeat the brief's order destination; no address, phone number, or opening hours may be invented.",
    "Never claim a rating, award, or customer count.",
  ],
};
