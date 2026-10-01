import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [
  { name: "value", required: true, kind: "text", maxLength: 16 },
  { name: "label", required: false, kind: "text", maxLength: 24 },
] as const;

export const price: VideoModule = {
  id: "Price",
  version: "1.1.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { value, label } = readSlots("Price", SLOTS, content);
    const labelHtml = label === undefined ? "" : `\n  <span class="hf-Price__label">${escapeHtml(label)}</span>`;
    return {
      html: `<div class="hf-Price hf-module" data-zone="price">
  <span class="hf-Price__value hf-anim" data-anim="rise">${escapeHtml(value)}</span>${labelHtml}
</div>`,
      css: `.hf-Price__value {
  display: block;
  font-family: var(--hf-display-family);
  font-size: var(--hf-price-size);
  line-height: 0.92;
  color: var(--hf-scene-ink);
  overflow-wrap: anywhere;
}

.hf-Price__label {
  display: block;
  margin-top: calc(0.8 * var(--hf-layout-unit));
  padding: var(--hf-label-pad, 0);
  background: var(--hf-support-ground, transparent);
  font-family: var(--hf-mono-family);
  font-size: calc(2.8 * var(--hf-layout-unit));
  line-height: 1.25;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--hf-scene-muted);
  overflow-wrap: anywhere;
}`,
    };
  },
};
