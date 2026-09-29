import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 24 }] as const;

/** The pack's deliberate-imperfection annotation: a rotated yellow badge, the one rotated display mark. */
export const offerBadge: VideoModule = {
  id: "OfferBadge",
  version: "1.0.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("OfferBadge", SLOTS, content);
    return {
      html: `<div class="hf-OfferBadge hf-module">
  <span class="hf-OfferBadge__text hf-anim" data-anim="scale">${escapeHtml(text)}</span>
</div>`,
      css: `.hf-OfferBadge {
  position: absolute;
  left: var(--hf-content-gutter);
  top: 26cqh;
  transform: rotate(-4deg);
  background: var(--hf-yellow);
  border: var(--hf-border) solid var(--hf-ink);
  padding: var(--hf-cell-pad);
}

.hf-OfferBadge__text {
  display: block;
  font-family: var(--hf-display-family);
  font-size: 4.2cqw;
  line-height: 0.92;
  text-transform: uppercase;
  color: var(--hf-ink);
}`,
    };
  },
};
