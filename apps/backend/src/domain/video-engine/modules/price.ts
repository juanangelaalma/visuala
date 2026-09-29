import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [
  { name: "value", required: true, kind: "text", maxLength: 16 },
  { name: "label", required: false, kind: "text", maxLength: 24 },
] as const;

export const price: VideoModule = {
  id: "Price",
  version: "1.0.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { value, label } = readSlots("Price", SLOTS, content);
    const labelHtml = label === undefined ? "" : `\n  <span class="hf-Price__label">${escapeHtml(label)}</span>`;
    return {
      html: `<div class="hf-Price hf-module">
  <span class="hf-Price__value hf-anim" data-anim="rise">${escapeHtml(value)}</span>${labelHtml}
</div>`,
      css: `.hf-Price {
  position: absolute;
  left: var(--hf-content-gutter);
  bottom: 30cqh;
}

.hf-Price__value {
  display: block;
  font-family: var(--hf-display-family);
  font-size: 6.4cqw;
  line-height: 0.88;
  color: var(--hf-ink);
}

.hf-Price__label {
  display: block;
  margin-top: 0.6cqw;
  font-family: var(--hf-mono-family);
  font-size: 1.25cqw;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hf-ink2);
}`,
    };
  },
};
