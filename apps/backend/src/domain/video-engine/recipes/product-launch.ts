import type { VideoRecipe } from "./types";

export const productLaunch: VideoRecipe = {
  id: "product_launch",
  version: "1.0.0",
  purpose: "Announce something new and make the announcement feel like an event.",
  required: ["productName", "audience", "keyMessage", "callToAction"],
  beats: [
    { id: "tease", intent: "withhold the product for one beat so the reveal has weight" },
    { id: "reveal", intent: "reveal the product and the announcement" },
    { id: "message", intent: "state the key message" },
    { id: "cta", intent: "close on the call to action" },
  ],
  recommendedModules: ["Headline", "ProductHero", "SupportingCopy", "BrandMark", "CTA"],
  defaultDurationSeconds: 10,
  defaultAspectRatio: "9:16",
  constraints: [
    "Never claim a launch date, availability, or price the brief does not state.",
    "The teaser beat must not show the product clearly.",
  ],
};
