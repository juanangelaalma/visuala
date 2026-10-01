import { escapeHtml } from "../html";
import { readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 40 }] as const;

/** Fit to measure: the ramp steps down as the claim gets longer, so a long line never touches the safe margin. */
export const headline: VideoModule = {
  id: "Headline",
  version: "1.1.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("Headline", SLOTS, content);
    const size = text.length <= 12 ? "hero" : text.length <= 24 ? "xl" : "lg";
    return {
      html: `<h1 class="hf-Headline hf-module" data-size="${size}">
  <span class="hf-Headline__text hf-anim" data-anim="rise">${escapeHtml(text)}</span>
</h1>`,
      css: `.hf-Headline {
  --hf-headline-size: 8cqw;
  position: absolute;
  left: var(--hf-content-gutter);
  right: var(--hf-content-gutter);
  bottom: 20cqh;
  margin: 0;
  max-width: var(--hf-headline-max-width);
}

.hf-Headline[data-size="hero"] { --hf-headline-size: 15.5cqw; }
.hf-Headline[data-size="xl"] { --hf-headline-size: 11cqw; }

.hf-Headline__text {
  display: block;
  font-family: var(--hf-display-family);
  font-size: var(--hf-headline-size);
  font-weight: 400;
  line-height: 0.92;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  color: var(--hf-ink);
}

@container (max-aspect-ratio: 4 / 5) {
  .hf-Headline {
    left: 50%;
    right: auto;
    top: 44cqh;
    bottom: auto;
    width: 78cqw;
    transform: translateX(-50%);
    text-align: center;
  }
}`,
    };
  },
};
