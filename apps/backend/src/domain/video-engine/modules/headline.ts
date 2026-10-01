import { animatedWords, readSlots } from "./support";
import type { VideoModule } from "./types";

const SLOTS = [{ name: "text", required: true, kind: "text", maxLength: 40 }] as const;

export const headline: VideoModule = {
  id: "Headline",
  version: "1.2.0",
  supportedRatios: ["9:16", "1:1", "16:9"],
  slots: SLOTS,
  build({ content }) {
    const { text } = readSlots("Headline", SLOTS, content);
    const size = text.length <= 12 ? "hero" : text.length <= 24 ? "xl" : "lg";
    return {
      html: `<h1 class="hf-Headline hf-module" data-zone="headline" data-size="${size}">
  <span class="hf-Headline__text hf-anim" data-anim="rise">${animatedWords(text)}</span>
</h1>`,
      css: `.hf-Headline {
  --hf-headline-size: var(--hf-headline-lg);
  margin: 0;
  align-self: center;
}

.hf-Headline[data-size="hero"] { --hf-headline-size: var(--hf-headline-hero); }
.hf-Headline[data-size="xl"] { --hf-headline-size: var(--hf-headline-xl); }

.hf-Headline__text {
  display: block;
  font-family: var(--hf-display-family);
  font-size: var(--hf-headline-size);
  font-weight: 400;
  line-height: 0.92;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  color: var(--hf-scene-ink);
  overflow-wrap: anywhere;
  text-wrap: balance;
}`,
    };
  },
};
