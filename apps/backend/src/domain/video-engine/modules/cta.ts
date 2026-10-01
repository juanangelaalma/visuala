import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 32 }] as const;

/** Square-cornered ink plate. The pack allows one pill chip per frame; a call to action is not it. */
export const cta: VideoModule = {
  id: "CTA",
  version: "1.1.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("CTA", SLOTS, content);
    return {
      html: `<div class="hf-CTA hf-module">
  <span class="hf-CTA__plate hf-anim" data-anim="rise">${escapeHtml(text)}</span>
</div>`,
      css: `.hf-CTA {
  position: absolute;
  left: var(--hf-content-gutter);
  right: var(--hf-content-gutter);
  bottom: 8cqh;
}

.hf-CTA__plate {
  display: inline-block;
  background: var(--hf-ink);
  color: var(--hf-cream);
  border: var(--hf-border) solid var(--hf-ink);
  box-shadow: var(--hf-hard-shadow) var(--hf-orange);
  padding: var(--hf-cell-pad);
  font-family: var(--hf-display-family);
  font-size: 2.4cqw;
  line-height: 1;
  text-transform: uppercase;
}

@container (max-aspect-ratio: 4 / 5) {
  .hf-CTA {
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
  }

  .hf-CTA__plate {
    display: block;
    padding: 3cqw;
    font-size: 5.5cqw;
    line-height: 0.92;
    text-align: center;
  }
}`,
    };
  },
};
