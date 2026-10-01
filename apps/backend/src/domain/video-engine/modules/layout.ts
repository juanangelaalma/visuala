export const SCENE_LAYOUT_CSS = `.hf-scene__content {
  --hf-layout-unit: min(1cqw, 1cqh);
  --hf-scene-ink: var(--hf-ink);
  --hf-scene-muted: var(--hf-ink2);
  --hf-plate-ground: var(--hf-ink);
  --hf-plate-ink: var(--hf-cream);
  --hf-headline-hero: calc(11 * var(--hf-layout-unit));
  --hf-headline-xl: calc(7.2 * var(--hf-layout-unit));
  --hf-headline-lg: calc(4.8 * var(--hf-layout-unit));
  --hf-support-size: calc(4 * var(--hf-layout-unit));
  --hf-cta-size: calc(4.8 * var(--hf-layout-unit));
  --hf-offer-size: calc(4.2 * var(--hf-layout-unit));
  --hf-price-size: calc(3.6 * var(--hf-layout-unit));
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-areas: "brand brand brand" "headline headline headline" "support support support" "product offer price" "cta cta cta";
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 0.9fr);
  grid-template-rows: max-content max-content max-content minmax(min-content, 1fr) max-content;
  gap: calc(1.5 * var(--hf-layout-unit));
  padding: 5cqh 5cqw 8cqh;
  isolation: isolate;
  color: var(--hf-scene-ink);
}

.hf-scene__content:has(.hf-BackgroundTexture[data-tone="ink"]) {
  --hf-scene-ink: var(--hf-cream);
  --hf-scene-muted: var(--hf-cream2);
  --hf-plate-ground: var(--hf-cream);
  --hf-plate-ink: var(--hf-ink);
}

.hf-scene__content:has(.hf-BackgroundTexture[data-tone="green"]) {
  --hf-scene-ink: var(--hf-cream);
  --hf-support-ground: var(--hf-cream);
  --hf-label-pad: calc(0.6 * var(--hf-layout-unit));
  --hf-scene-muted: var(--hf-ink);
  --hf-cta-ground: transparent;
  --hf-cta-ink: var(--hf-cream);
}

.hf-scene__content:has(.hf-BackgroundTexture[data-tone="green"]),
.hf-scene__content:has(.hf-BackgroundTexture[data-tone="pink"]),
.hf-scene__content:has(.hf-BackgroundTexture[data-tone="orange"]) {
  --hf-scene-muted: var(--hf-ink);
}

.hf-scene__content > [data-zone] { min-width: 0; min-height: 0; }
.hf-scene__content > [data-zone]:not([data-zone="product"]) { min-height: min-content; }
.hf-word { display: inline-block; max-width: 100%; overflow-wrap: anywhere; vertical-align: top; }
.hf-scene__content > [data-zone="brand"] { grid-area: brand; }
.hf-scene__content > [data-zone="headline"] { grid-area: headline; }
.hf-scene__content > [data-zone="product"] { grid-area: product; }
.hf-scene__content > [data-zone="support"] { grid-area: support; align-self: center; }
.hf-scene__content > [data-zone="offer"] { grid-area: offer; align-self: start; }
.hf-scene__content > [data-zone="price"] { grid-area: price; align-self: start; }
.hf-scene__content > [data-zone="cta"] { grid-area: cta; align-self: end; }

.hf-scene[data-role="offer"] .hf-scene__content { --hf-offer-size: calc(5.6 * var(--hf-layout-unit)); }
.hf-scene[data-role="offer"] .hf-scene__content:not(:has(.hf-OfferBadge)) { --hf-price-size: calc(6.4 * var(--hf-layout-unit)); }
.hf-scene[data-role="cta"] .hf-scene__content { --hf-cta-size: calc(5.2 * var(--hf-layout-unit)); }
.hf-scene[data-role="cta"] .hf-ProductHero__visual { max-height: 28cqh; }

@container (max-aspect-ratio: 4 / 5) {
  .hf-scene__content {
    --hf-headline-hero: 13cqw;
    --hf-headline-xl: 9cqw;
    --hf-headline-lg: 7.2cqw;
    --hf-support-size: 4.2cqw;
    --hf-cta-size: 5.6cqw;
    --hf-price-size: 5cqw;
    grid-template-areas: "brand brand" "product product" "headline headline" "support support" "offer price" "cta cta";
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: max-content minmax(0, 1fr) max-content max-content max-content max-content;
    row-gap: 2.4cqw;
    padding: 6cqh 6cqw 10cqh;
  }
  .hf-Headline, .hf-CTA { text-align: center; }
  .hf-scene[data-role="cta"] .hf-scene__content { --hf-cta-size: 6.6cqw; }
}

@container (min-aspect-ratio: 4 / 3) {
  .hf-scene__content {
    --hf-support-size: 3.8cqh;
    --hf-headline-hero: 10cqh;
    --hf-headline-xl: 7.2cqh;
    --hf-headline-lg: 4.2cqh;
    --hf-price-size: 3.6cqh;
    grid-template-areas: "brand brand product" "headline headline product" "support support product" "offer price product" "cta cta product";
    grid-template-columns: minmax(0, 0.55fr) minmax(0, 0.55fr) minmax(0, 1fr);
    grid-template-rows: max-content max-content max-content minmax(min-content, 1fr) max-content;
    gap: 1cqh 3cqw;
    padding: 5cqh 5cqw 9cqh;
  }
  .hf-scene[data-role="cta"] .hf-ProductHero__visual { max-height: 55cqh; }
  .hf-scene[data-role="cta"] .hf-scene__content { --hf-cta-size: 5.2cqh; }
}

.hf-scene[data-role="offer"] .hf-scene__content:not(:has(.hf-ProductHero, .hf-Headline, .hf-Price, .hf-CTA)) {
  --hf-offer-size: calc(10 * var(--hf-layout-unit));
  grid-template-areas: "brand" "offer" "support";
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(min-content, 1fr) auto;
}

.hf-scene[data-role="offer"] .hf-scene__content:not(:has(.hf-ProductHero, .hf-Headline, .hf-Price, .hf-CTA)) > .hf-OfferBadge {
  width: min(78cqw, 100%);
  justify-self: center;
  align-self: center;
  text-align: center;
}

.hf-scene[data-role="cta"] .hf-scene__content:not(:has(.hf-ProductHero, .hf-Headline, .hf-Price, .hf-OfferBadge)) {
  --hf-cta-size: calc(8 * var(--hf-layout-unit));
  grid-template-areas: "brand" "cta" "support";
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(min-content, 1fr) auto;
}

.hf-scene[data-role="cta"] .hf-scene__content:not(:has(.hf-ProductHero, .hf-Headline, .hf-Price, .hf-OfferBadge)) > .hf-CTA {
  width: min(78cqw, 100%);
  justify-self: center;
  align-self: center;
  text-align: center;
}

.hf-scene[data-role="product"] .hf-scene__content:not(:has(.hf-OfferBadge, .hf-Price, .hf-CTA)) {
  grid-template-areas: "brand" "product" "headline" "support";
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto auto;
}

@container (min-aspect-ratio: 4 / 3) {
  .hf-scene[data-role="product"] .hf-scene__content:not(:has(.hf-OfferBadge, .hf-Price, .hf-CTA)) {
    grid-template-areas: "brand product" "headline product" "support product";
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    grid-template-rows: auto minmax(min-content, 1fr) auto;
  }
}`;
