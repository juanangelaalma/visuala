import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 120 }] as const;

export const supportingCopy: VideoModule = {
  id: "SupportingCopy",
  version: "1.1.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("SupportingCopy", SLOTS, content);
    return {
      html: `<p class="hf-SupportingCopy hf-module" data-zone="support">
  <span class="hf-SupportingCopy__text hf-anim" data-anim="fade">${escapeHtml(text)}</span>
</p>`,
      css: `.hf-SupportingCopy {
  margin: 0;
  text-align: left;
}

.hf-SupportingCopy__text {
  display: block;
  padding: calc(0.8 * var(--hf-layout-unit));
  background: var(--hf-support-ground, transparent);
  font-family: var(--hf-body-family);
  font-size: var(--hf-support-size);
  line-height: 1.25;
  color: var(--hf-scene-muted);
  overflow-wrap: anywhere;
  text-wrap: pretty;
}`,
    };
  },
};
