import { animatedWords, readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 24 }] as const;

/** The featured marker keeps its rotation separate from the animated copy. */
export const offerBadge: VideoModule = {
  id: "OfferBadge",
  version: "1.2.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("OfferBadge", SLOTS, content);
    return {
      html: `<div class="hf-OfferBadge hf-module" data-zone="offer">
  <div class="hf-OfferBadge__plate">
    <span class="hf-OfferBadge__text hf-anim" data-anim="scale">${animatedWords(text)}</span>
  </div>
</div>`,
      css: `.hf-OfferBadge {
  padding: calc(2.5 * var(--hf-layout-unit)) calc(3 * var(--hf-layout-unit));
}

.hf-OfferBadge__plate {
  transform: rotate(-4deg);
  background: var(--hf-pink);
  border: var(--hf-border) solid var(--hf-ink);
  box-shadow: var(--hf-hard-shadow) var(--hf-orange);
  padding: calc(1.7 * var(--hf-layout-unit));
}

.hf-OfferBadge__text {
  display: block;
  font-family: var(--hf-mono-family);
  font-size: var(--hf-offer-size);
  line-height: 1.15;
  text-transform: uppercase;
  color: var(--hf-ink);
  overflow-wrap: anywhere;
}`,
    };
  },
};
