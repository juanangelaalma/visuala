import type { VideoRecipe } from "./types";

export const productPromo: VideoRecipe = {
  id: "product_promo",
  version: "1.0.0",
  purpose: "Put one hero product in the frame and move the viewer to buy it.",
  required: ["productName", "keyMessage", "callToAction"],
  beats: [
    { id: "hook", intent: "open on the product itself so the first frame already shows what is sold" },
    { id: "message", intent: "state the single key message the brief supplies" },
    { id: "proof", intent: "hold on the product so the viewer can read it" },
    { id: "cta", intent: "close on the call to action" },
  ],
  recommendedModules: ["ProductHero", "Headline", "SupportingCopy", "CTA"],
  defaultDurationSeconds: 10,
  defaultAspectRatio: "9:16",
  constraints: [
    "Never invent a price, discount, rating, or benefit the brief does not state.",
    "The product asset must be visible in at least one beat.",
  ],
};
