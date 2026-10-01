import { animatedWords, readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 32 }] as const;

/** Square-cornered ink plate. The pack allows one pill chip per frame; a call to action is not it. */
export const cta: VideoModule = {
  id: "CTA",
  version: "1.2.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("CTA", SLOTS, content);
    const size = text.length > 24 ? "long" : "short";
    return {
      html: `<div class="hf-CTA hf-module" data-zone="cta" data-size="${size}">
  <span class="hf-CTA__plate hf-anim" data-anim="rise">${animatedWords(text)}</span>
</div>`,
      css: `.hf-CTA {
  margin: 0;
}

.hf-CTA[data-size="long"] { --hf-cta-fit: 0.8; }

.hf-CTA__plate {
  display: block;
  max-width: 100%;
  background: var(--hf-cta-ground, var(--hf-plate-ground));
  color: var(--hf-cta-ink, var(--hf-plate-ink));
  border: var(--hf-border) solid var(--hf-cta-ground, var(--hf-plate-ground));
  padding: calc(2 * var(--hf-layout-unit));
  font-family: var(--hf-display-family);
  font-size: calc(var(--hf-cta-size) * var(--hf-cta-fit, 1));
  line-height: 0.92;
  text-transform: uppercase;
  overflow-wrap: anywhere;
  text-wrap: balance;
}`,
    };
  },
};
