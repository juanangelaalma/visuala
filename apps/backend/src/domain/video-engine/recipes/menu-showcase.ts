import type { VideoRecipe } from "./types";

export const menuShowcase: VideoRecipe = {
  id: "menu_showcase",
  version: "1.0.0",
  purpose: "Show a small menu without turning it into a price list that invents anything.",
  required: ["productName", "menuItems", "orderDestination"],
  beats: [
    { id: "open", intent: "open on the venue or the best-looking item" },
    { id: "menu", intent: "present the named menu items from the brief" },
    { id: "cta", intent: "close on where to order" },
  ],
  recommendedModules: ["Headline", "Price", "SupportingCopy", "CTA", "BackgroundTexture"],
  defaultDurationSeconds: 15,
  defaultAspectRatio: "9:16",
  constraints: [
    "A menu item price may only be shown when the brief records that exact item's price; otherwise the price slot stays empty.",
    "No item may be added to the menu that the brief does not name.",
  ],
};
