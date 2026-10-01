import type { RecipeBeat } from "./recipes/types";

export type BeatPurpose = "product" | "message" | "offer" | "closing" | "tease" | "menu";

const BEAT_PURPOSES: Readonly<Record<string, BeatPurpose>> = {
  hook: "product",
  product_reveal: "product",
  proof: "product",
  open: "product",
  establish: "product",
  reveal: "product",
  message: "message",
  highlight: "message",
  offer_reveal: "offer",
  cta: "closing",
  visit: "closing",
  tease: "tease",
  menu: "menu",
};

export function beatPurpose(beat: RecipeBeat): BeatPurpose {
  const purpose = BEAT_PURPOSES[beat.id];
  if (!purpose) throw new Error(`No scene purpose is defined for recipe beat ${beat.id}.`);
  return purpose;
}

export function closingCopy(brief: { callToAction: string | null; orderDestination: string | null; keyMessage: string }, beat: RecipeBeat): string {
  return beat.id === "visit" ? brief.orderDestination ?? brief.keyMessage : brief.callToAction ?? brief.orderDestination ?? brief.keyMessage;
}
