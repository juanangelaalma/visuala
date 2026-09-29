import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 120 }] as const;

export const supportingCopy: VideoModule = {
  id: "SupportingCopy",
  version: "1.0.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("SupportingCopy", SLOTS, content);
    return {
      html: `<p class="hf-SupportingCopy hf-module">
  <span class="hf-SupportingCopy__text hf-anim" data-anim="fade">${escapeHtml(text)}</span>
</p>`,
      css: `.hf-SupportingCopy {
  position: absolute;
  left: var(--hf-content-gutter);
  right: var(--hf-content-gutter);
  bottom: 14cqh;
  margin: 0;
}

.hf-SupportingCopy__text {
  display: block;
  font-family: var(--hf-body-family);
  font-size: 1.46cqw;
  line-height: 1.4;
  color: var(--hf-ink);
}`,
    };
  },
};
