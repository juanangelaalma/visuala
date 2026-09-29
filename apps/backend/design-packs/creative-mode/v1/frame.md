---
name: Creative Mode — Frame (video style pack)
styleId: creative-mode
version: "1"
unit: the frame — 1920x1080 primary; 9:16 and 1:1 supported
principle: atoms are sacred · composition is free · numbers come from the script
---

# Creative Mode — Frame

A neo-brutalist editorial poster in motion's clothing: warm cream paper, near-black ink, four accents
that collide at full saturation, hard offset shadows, Archivo Black uppercase, JetBrains Mono labels,
Space Grotesk body copy. Every frame is one flat colour-blocked composition. Reserved for promo and
product videos that want a loud, printed, poster-like voice.

## Non-negotiables

- **Cream ground** on nearly every frame; **green ground** is reserved for the single closing plate.
- **0.4cqw ink borders** on structural elements, 0.3cqw internal rules; square corners everywhere.
- **Hard offset shadow** on at most one featured block per frame; never blurred, never a gradient, never a glow.
- **Archivo Black uppercase at 0.92 line-height** for every display line; sentence case does not exist.
- **JetBrains Mono** for every label, kicker, counter, badge; **Space Grotesk** for body copy only.
- **Two or three accents per frame**, never all four. **One pill chip** (999px) at most per frame.

## Composition

- **One idea per frame.** The focal element dominates its nearest neighbour by 3–5x; never two rival headlines.
- **Sparse frames read 45–60% empty** (cover, claim, closer). Only a stat grid or a comparison ledger runs dense.
- **Anchor:** centred is the default; asymmetric only for a marker/callout. Never three frames in a row on the same anchor.
- **Fit to measure:** a headline block caps at 78cqw. ≤3 words to `display-hero`/`display-xl`, 4–6 words to `display-lg`, 7+ words to `display-head`.
- **Legibility floor:** no load-bearing line below 1.4cqw. Copy sits on an opaque or scrim-backed surface.
- **Vary the ground between frames** (cream, then an accent field, then cream) so a run of scenes has rhythm.

## Frame treatments

1. **Wordmark cover** — cream ground, two-line wordmark at `display-hero`, second line in one accent, ~55% empty.
2. **Big claim** — one full-bleed accent ground, claim left-anchored at `display-xl`/`display-lg` in ink, ~45% empty.
3. **Stat grid** — cream ground, `display-head` over three ink-bordered stat cells; the one dense exception.
4. **Closing plate** — the single green ground, a two-line sign-off at `display-lg` in cream, one rotated stamp.
5. **Featured marker** — cream ground, one pink marker block carrying the orange+ink hard shadow, asymmetric.
6. **Comparison ledger** — cream-2 table with an ink head row and one filled winning column.

Pick a treatment per beat and state it in the art direction. `fixed` is type, geometry, and the rules
above; `free` is which accent, the copy, the line breaks, and whether the focal element is centred.

## Aspect-ratio behaviour

| Treatment | 16:9 | 9:16 | 1:1 |
|---|---|---|---|
| Wordmark cover | two lines centred | stacked taller, circle above | centred, tighter |
| Big claim | claim left, full accent | claim top, accent full | claim centred |
| Stat grid | head over 3-up row | head top, 3 stacked | head top, 2x2 |
| Closing plate | sign-off centred, stamp corner | stacked, stamp below | centred, stamp corner |
| Featured marker | marker asymmetric | marker centred, shadow down | marker centred |
| Comparison ledger | full-width table | fewer columns | 2-column table |

Re-step the display ramp per ratio so no load-bearing line drops below the 1.4cqw floor. The 3.3cqw
chrome inset holds on the short edge at every ratio.

## Do

- Compose around one idea per frame; give the focal element 3–5x dominance.
- Keep sparse frames 45–60% empty; spend the hard shadow on one block.
- Use two or three accents per frame; keep green ground for the closing plate.

## Don't

- Don't round corners (except the pill chip); don't gradient, blur, or glow.
- Don't set Archivo Black in sentence case or letter-space it beyond -0.01em.
- Don't centre body copy; don't set labels in anything but JetBrains Mono.
- Don't blow a headline edge to edge; step the ramp down for long lines.
- Don't put two hard shadows on one frame; don't use all four accents on one frame.

## Numerals and claims

Never invent figures, percentages, counts, or dates. A price, discount, benefit, or CTA may appear
only when the brief supplies it; otherwise render a placeholder (`{metric}`) or omit the element.
This pack supplies geometry and voice, never facts.
