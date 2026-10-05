This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use pnpm for this workspace:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI provider service

The provider-neutral AI service moved to the backend service in `apps/backend`, which now owns image assets, text generation, and usage telemetry. See [`../backend/docs/ai-provider-service.md`](../backend/docs/ai-provider-service.md).

## Video interview streaming

Opening questions, opening retries, typed answers and option answers consume authenticated POST SSE
through the existing browser API client. Question fragments appear in one provisional bubble; final
saved messages, controls and project state replace it. Partial assistant text is never persisted.
Disconnect recovery reads the saved workspace without replaying the answer. If that read fails,
`Muat ulang percakapan` remains available and sending stays blocked.

Below 1024px, the shared sidebar uses a labelled menu disclosure. Navbar actions wrap, and chat,
preview and brief stack. The desktop sidebar and Visuala palette remain intact. Long unbroken
messages shrink and wrap inside their bubbles instead of widening the grid.

Deploy both POST consumers and backend routes together. See the
[SSE contract](../backend/docs/chat-video-generator.md#streamed-interview-responses).

### Verification record: 2026-10-01

- Backend focused streaming regressions: 228 passed across seven files; `pnpm --filter backend build` passed.
- App focused streaming regressions: 85 passed across four files; `pnpm --filter app exec tsc --noEmit` passed after the responsive fix.
- Real HTTP, explicitly gated provider fixture: saved-user acknowledgement and question fragments arrived while generation remained unresolved. Release produced saved final controls. Abrupt EOF retained unknown usage/cost; invalid terminal schema retained known usage; a server-selected fallback replaced the preview.
- Actual Next browser surface against isolated fixture authentication and in-memory repositories: opening/retry, typed/option answers, reload persistence, authoritative fallback, transport loss, failed/successful reload recovery and navigation cancellation exercised. No automatic POST replay; acknowledged answers survived without a partial saved assistant.
- Layout sampled at 320, 390, 768, 1024 and 1440px: page width matched viewport width, navbar fit, all bubbles fit, including a 320-character unbroken answer. Intermediate and final screenshots captured.
- Keyboard: option submission with Enter, mobile disclosure with Space, sidebar collapse/expand, account-menu Escape and restored focus exercised. Mobile menu closed after navigation. Menu/account actions measured at least 44px high.
- Screen-reader semantics inspected: provisional bubble `aria-busy="true"`, `aria-live="off"`; one stable polite generation status; saved transcript remains the log.
- Computed sRGB colors and opaque ancestor backgrounds: assistant text 14.37:1, user text 17.51:1, helper text 4.69:1, lime focus on black 17.51:1. Focus outline observed at 2px. The final browser session reported no errors; injected transport failures were expected in fault scenarios.
- Live integration was not verified: `ai:check-config` returned `AI_CONFIG_ERROR`, and `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD` were unset. Fixture evidence does not establish configured gateway/model compatibility or production Supabase persistence. Temporary smoke/browser fixtures were removed.

### Antislop delivery gate

Scope: changed streaming states and the approved responsive shell fix, not unrelated pages or
pre-existing dashboard destinations. Design Read: existing dark cinematic creator workspace;
ENERGY 2 / RHYTHM 2 / MOTION 1. Evidence is the browser record above, not source inspection alone.

#### Hard gate

- R-02 PASS: new interface copy contains no em dashes.
- R-03 PASS: five sampled widths fit; the long answer and provisional bubble stayed within chat.
- R-17 PASS: no statistics or performance claims were added.
- R-18 PASS: no testimonials or invented customer identities were added; browser data was explicitly a fixture.
- R-23 PASS: existing brand assets retained; the responsive navigation change was explicitly approved.
- R-24 PASS: no navigation destinations were added; Video navigation and project creation were exercised.
- R-25 PASS: measured text contrast exceeded 4.5:1, including 10px helper text at 4.69:1.
- R-26 PASS: stream retry/reload/send and menu controls executed their real callbacks; no new inert controls.
- R-27 PASS: preparing, progressive, final, disconnected and failed-reconciliation states were exercised.
- R-28 PASS: no FAQ was added.
- R-32 PASS: keyboard submission, disclosure, account Escape and visible 2px lime focus were observed.
- R-33 PASS: production changes were made in source; browser scripts exercised behavior, not source/CSS patches.
- R-34 PASS: the shipped dark theme was observed; no theme toggle or second theme was introduced.
- R-35 PASS: the actual Next surface and real HTTP streaming path ran; changed interactions were exercised.
- R-36 PASS: no security, compliance, performance or customer claims were added.
- R-37 PASS: declared direction and dials retain `DESIGN.md` rather than invent a new visual language.
- R-38 PASS: fixture evidence is labelled; no fabricated production content was added.

#### Purpose gate

- R-01 PASS: existing dark surfaces separate conversation and brief; no new gradient/glow.
- R-04 PASS: plus/minus indicate menu state; no generic AI icon was added.
- R-06 PASS: existing Visuala type hierarchy retained; no new display or monospace treatment.
- R-07 PASS: no background grid, blueprint or dot pattern.
- R-08 PASS: no decorative CTA arrows were added.
- R-09 PASS: no new promotional badge.
- R-10 PASS: no new glass layers.
- R-12 PASS: existing surface treatment retained; no new floating elevation.
- R-13 PASS: no new glow.
- R-14 PASS: conversation remains dominant; preview, brief and output retain their distinct functions.
- R-19 PASS: text follows received deltas; no typing timers, looping cursor or template entrance animation.
- R-22 PASS: no illustration was added.

#### Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 explicitly declared.
- Dial consistency PASS: restrained surfaces, lime answers/actions and functional progress observed.
- Focal point PASS: the active conversation leads the workspace; controls appear only after saved completion.
- Whitespace PASS: existing panel gaps distinguish conversation from preview/brief; phone layout stacks them.
- Accent PASS: existing lime is the deliberate action/answer accent.
- Identity PASS: Visuala brand, display type and rounded surface hierarchy retained in screenshots.
- Design Read PASS: direction declared before implementation; responsive scope separately approved.

#### Craftsmanship and quality locks

- C-1 PASS: each addition serves progress, safe recovery or narrow-screen navigation.
- C-2 PASS: changed controls submit, retry, reload, toggle or navigate; behavior observed.
- C-3 PASS: no filler sections; existing conversation/brief/preview composition retained.
- C-4 PASS: tested pending/final/error/navigation states and phone/tablet/desktop widths; keyboard controls remained usable.
- C-5 PASS: fixture observations and missing live prerequisites are distinguished from production claims.
- R-05 PASS: conversation-led composition retained, not a new marketing template.
- R-11 PASS: pill actions, rounded bubbles and larger panels retain radius variation.
- R-15 PASS: added actions name their operation: menu, close menu and reload conversation.
- R-16 PASS: no marketing buzzwords added.
- R-20 PASS: screenshots retain Visuala typography, lime accent and cinematic dark surfaces.
- R-21 PASS: dark styling follows the explicit existing `DESIGN.md` direction.
- R-29 PASS: no new palette colors.
- R-30 PASS: no replacement visual system or competitor imitation.
- R-31 PASS: progress is transient, recovery blocks unsafe sends, and mobile navigation frees chat width.


## Next.js development

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
