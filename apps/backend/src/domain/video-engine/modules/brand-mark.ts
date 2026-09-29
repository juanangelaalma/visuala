import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 40 }] as const;

/** The inverted eyebrow chip: mono, ink background, cream ink. */
export const brandMark: VideoModule = {
  id: "BrandMark",
  version: "1.0.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("BrandMark", SLOTS, content);
    return {
      html: `<div class="hf-BrandMark hf-module">
  <span class="hf-BrandMark__text hf-anim" data-anim="fade">${escapeHtml(text)}</span>
</div>`,
      css: `.hf-BrandMark {
  position: absolute;
  left: var(--hf-content-gutter);
  top: 8cqh;
}

.hf-BrandMark__text {
  display: inline-block;
  background: var(--hf-ink);
  color: var(--hf-cream);
  padding: 0.5cqw 1cqw;
  font-family: var(--hf-mono-family);
  font-size: 1.25cqw;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}`,
    };
  },
};
