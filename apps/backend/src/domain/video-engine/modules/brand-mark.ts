import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 40 }] as const;

export const brandMark: VideoModule = {
  id: "BrandMark",
  version: "1.1.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("BrandMark", SLOTS, content);
    return {
      html: `<div class="hf-BrandMark hf-module" data-zone="brand">
  <span class="hf-BrandMark__text hf-anim" data-anim="fade">${escapeHtml(text)}</span>
</div>`,
      css: `.hf-BrandMark {
  align-self: start;
}

.hf-BrandMark__text {
  display: inline-block;
  max-width: 100%;
  background: var(--hf-plate-ground);
  color: var(--hf-plate-ink);
  padding: calc(0.8 * var(--hf-layout-unit)) calc(1.2 * var(--hf-layout-unit));
  font-family: var(--hf-mono-family);
  font-size: calc(2.6 * var(--hf-layout-unit));
  line-height: 1.3;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}`,
    };
  },
};
