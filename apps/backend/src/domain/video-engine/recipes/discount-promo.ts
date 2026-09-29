import type { VideoRecipe } from "./types";

export const discountPromo: VideoRecipe = {
  id: "discount_promo",
  version: "1.0.0",
  purpose: "Lead with the offer from the brief and convert on urgency.",
  required: ["productName", "keyMessage", "offer", "callToAction"],
  beats: [
    { id: "product_reveal", intent: "show the product before the offer so the discount lands on something real" },
    { id: "offer_reveal", intent: "state the offer exactly as the brief records it" },
    { id: "cta", intent: "close on the call to action" },
  ],
  recommendedModules: ["ProductHero", "Headline", "OfferBadge", "Price", "CTA"],
  defaultDurationSeconds: 12,
  defaultAspectRatio: "9:16",
  constraints: [
    "The offer text may only repeat the brief's offer label and detail; no percentage, price, or end date may be invented.",
    "The brief must carry a confirmed offer fact before the composition is compiled.",
  ],
};
