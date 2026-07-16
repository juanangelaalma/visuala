# Payment UI Flow Implementation Plan

## Goal

Design and implement the first UI pass for Visuala credit purchase checkout, from pricing click to credited wallet confirmation, using `docs/billing-credit-wallet-database-flow.md` as the source of truth and OpenAI's payment flow screenshots in `openai-flow/` as the interaction reference.

This phase is UI-first. It should model the expected product flow and state transitions without trusting client-side payment completion for credit fulfillment.

## References

- Database and fulfillment flow: `docs/billing-credit-wallet-database-flow.md`
- OpenAI screenshots:
  - `openai-flow/1. user klik payment.png`
  - `openai-flow/2. plan page.png`
  - `openai-flow/3. loading.png`
  - `openai-flow/4. user choose payment method and pay.png`
- Existing marketing pricing UI:
  - `apps/web/app/_sections/PricingSection.tsx`
  - `apps/web/app/_sections/PricingTabs.tsx`
- Shared UI package target:
  - `packages/ui/src`

## Product Flow

```txt
1. User clicks pricing CTA
2. User lands on plan-selection page without dashboard sidebar/layout
3. User selects a credit plan
4. UI shows plan preparation/loading state
5. User lands on configure-payment page
6. User selects and completes payment inside embedded Xendit Components
7. Xendit Components may show provider-owned payment instructions such as QRIS, virtual account, or e-wallet steps
8. UI shows verification state after component completion
9. Payment is verified by webhook
10. User sees credits added / wallet updated state only after server-confirmed fulfillment
```

## Route Proposal

Use standalone billing routes outside `dashboard` so they do not inherit the dashboard sidebar/layout.

```txt
apps/app/app/billing/plans/page.tsx
apps/app/app/billing/checkout/[paymentIntentId]/page.tsx
apps/app/app/billing/checkout/[paymentIntentId]/loading.tsx
apps/app/app/billing/checkout/[paymentIntentId]/success/page.tsx
```

Optional route group if more isolation is needed later:

```txt
apps/app/app/(billing)/billing/...
```

No dashboard layout should wrap these pages.

## Shared UI Extraction Plan

Move reusable pricing UI from `apps/web` to `packages/ui` while keeping app-specific data fetching in each app.

### New shared components

```txt
packages/ui/src/PricingPlans.tsx
packages/ui/src/PricingPlanCard.tsx
packages/ui/src/PricingPeriodTabs.tsx
packages/ui/src/EmbeddedPaymentShell.tsx
packages/ui/src/PaymentSummaryCard.tsx
packages/ui/src/PaymentVerificationState.tsx
packages/ui/src/CheckoutLoadingState.tsx
```

### New shared types

```txt
packages/ui/src/pricing-types.ts
packages/ui/src/payment-types.ts
```

### Export updates

Update:

```txt
packages/ui/src/index.ts
```

Export the new pricing and payment UI primitives from the package root. Apps should import from `@visuala/ui`, not deep paths.

### Keep app-specific code outside UI package

Keep these in `apps/app` or `apps/web`:

- Fetch pricing plans.
- Create payment intent.
- Create Xendit payment session.
- Poll payment status.
- Redirect after actions.
- Auth and authorization.
- Provider SDK mounting.

`packages/ui` should accept plain props and callbacks only.

## UI Design Direction

The OpenAI flow is light, minimal, centered, and focused. Visuala should clone the flow structure but keep Visuala brand cues subtly.

### Plan-selection page

Reference: `openai-flow/2. plan page.png`

Layout:

- Full-page standalone surface.
- No sidebar.
- No dashboard navbar.
- Top centered title: `Upgrade your credits` or `Choose your credit plan`.
- Close button in top-right.
- Centered segmented control if needed:
  - `Personal`
  - `Business`
- 3-4 pricing cards in a horizontal grid on desktop.
- Each card includes:
  - Plan name.
  - Price in IDR.
  - Included credits.
  - Bonus credits.
  - Expiry period.
  - CTA button.
  - Feature list.
- Popular plan highlighted with soft blue/lime-tinted background, matching OpenAI's visual hierarchy but using Visuala tokens where appropriate.

Suggested copy mapping:

```txt
Free / Trial
Rp0
Try Visuala creation
Limited credits

Starter
Rp75.000
Keep creating with more credits
Includes credits + bonus

Plus
Rp349.000
Unlock the full creative experience
Popular

Pro
Rp1.889.000
Maximize your production capacity
Highest credit bundle
```

Actual pricing values must come from `pricing_plans`, not from client input.

### Loading state

Reference: `openai-flow/3. loading.png`

Use a sparse centered state:

```txt
Preparing your checkout
Creating a secure Visuala payment session
```

Alternative while checking webhook confirmation:

```txt
Verifying your payment
Credits will be added automatically after confirmation
```

### Embedded checkout page

Reference: `openai-flow/4. user choose payment method and pay.png`

Layout:

- Centered two-column checkout.
- Left column: embedded Xendit Components container.
- Right column: sticky plan summary card.
- Back button + title: `Configure your payment`.

Left column behavior:

```txt
Pay with
[Xendit Components mounted here]
```

Xendit Components owns the real payment-method UI and any provider-owned instructions for:

- QRIS
- Bank transfer / virtual accounts such as BCA and BRI
- E-wallets such as GoPay and ShopeePay

Do not build fake card fields, fake QRIS codes, fake virtual account numbers, or fake wallet instructions in Visuala UI. Visuala only provides the OpenAI-like checkout shell around the embedded provider component.

Provider embed placeholder before mount:

```txt
Secure payment details are handled by Xendit.
Choose QRIS, bank transfer, or e-wallet inside the secure payment area.
```

Right summary card:

- Plan name.
- Top benefits.
- Credit amount.
- Bonus credits.
- Expiry.
- Subtotal.
- Taxes/fees if available.
- Due today.
- Safe status text.

CTA behavior:

- If Xendit renders its own pay/continue button, do not duplicate it.
- If the SDK requires an external trigger, Visuala may render a single `Continue to payment` button wired to Xendit SDK APIs only.
- Visuala button clicks must not grant credits.

### Provider-owned payment instructions

Payment instructions should be rendered by Xendit Components whenever possible. Visuala may show supporting text around the embedded area, but must not invent provider identifiers or instructions.

Allowed Visuala support copy:

```txt
Follow the payment instructions shown in the secure payment area.
Your credits will be added after Xendit confirms the payment.
```

If a future Xendit API response returns safe instruction data outside the component, Visuala can display it only after adding an explicit application/domain contract for that provider response. Until then, instructions stay inside Xendit Components.

### Success / credited state

Fulfillment rule:

```txt
Credits are granted only from verified provider webhooks, never from client-side payment completion callbacks.
```

Success page should only show credited state after the server reports `billing_payment_intents.status = paid` and wallet/ledger has been updated.

If payment is completed in provider UI but webhook is still processing, show:

```txt
Payment is being verified
Credits will be added automatically after confirmation.
```

Final success copy:

```txt
Credits added
1.200 credits are now available in your wallet.
```

## Data Contract for UI Components

Shared UI should use camelCase props only.

```ts
type CreditPricingPlan = {
  id: string;
  slug: string;
  name: string;
  priceAmount: number;
  currency: string;
  credits: number;
  bonusCredits: number;
  creditExpiresInDays: number;
  billingLabel?: string;
  badgeLabel?: string;
  isMostPopular?: boolean;
  features: string[];
  ctaLabel: string;
};
```

```ts
type EmbeddedPaymentShell = {
  paymentIntentId: string;
  providerClientSecret: string;
  provider: "xendit";
  expiresAt?: string;
  status: "pending" | "paid" | "expired" | "failed";
};
```

```ts
type CheckoutSummary = {
  planName: string;
  amount: number;
  currency: string;
  credits: number;
  bonusCredits: number;
  creditExpiresInDays: number;
  feesAmount?: number;
  dueTodayAmount: number;
  benefits: string[];
};
```

## Server and Architecture Plan

Follow `apps/app` layered architecture.

### UI/routes

Routes and components may call server actions or application use cases. They must not query Supabase directly.

### Feature layer

Proposed feature folder:

```txt
apps/app/features/billing/
  actions/create-checkout-action.ts
  schemas/create-checkout-schema.ts
  components/BillingPlanSelection.tsx
  components/BillingCheckoutForm.tsx
  components/EmbeddedXenditCheckout.tsx
  components/PaymentVerification.tsx
```

Server action rules:

- File starts with `"use server"`.
- Validate form data with Zod.
- Use `Object.fromEntries(formData)`.
- Return user-safe action state only.

### Application layer

Use cases:

```txt
apps/app/application/billing/create-payment-intent.ts
apps/app/application/billing/create-embedded-checkout-session.ts
apps/app/application/billing/get-checkout-summary.ts
apps/app/application/billing/get-payment-status.ts
apps/app/application/billing/get-wallet-balance.ts
```

### Domain layer

Interfaces and types:

```txt
apps/app/domain/billing/billing-payment-intent.ts
apps/app/domain/billing/billing-provider.ts
apps/app/domain/billing/pricing-plan-repository.ts
apps/app/domain/billing/payment-intent-repository.ts
apps/app/domain/credits/credit-wallet-repository.ts
```

### Infrastructure layer

Supabase and Xendit details stay in infrastructure adapters:

```txt
apps/app/infrastructure/billing/supabase-pricing-plan-repository.ts
apps/app/infrastructure/billing/supabase-payment-intent-repository.ts
apps/app/infrastructure/billing/xendit-billing-provider.ts
```

## Implementation Sequence

### Phase 1: UI-only shell

1. Move reusable pricing card/tabs UI into `packages/ui`.
2. Update `apps/web` pricing section to consume shared UI.
3. Add standalone billing plan page in `apps/app`.
4. Add loading UI matching OpenAI loading screen.
5. Add embedded checkout UI shell with Xendit Components mount area and summary.
6. Add provider-owned instruction support copy around the embedded component.
7. Add success/verification UI states.

### Phase 2: Server actions and mocked-to-real boundary

1. Add create checkout server action.
2. Validate `pricingPlanSlug` or `pricingPlanId` only.
3. Load pricing from repository.
4. Create internal `billing_payment_intents` record.
5. Create Xendit Payment Session in COMPONENTS mode.
6. Redirect to checkout page.

### Phase 3: Provider integration

1. Mount Xendit Components with `providerClientSecret`.
2. Let Xendit Components own payment method selection and provider instructions.
3. Poll safe payment status endpoint or server refresh status.
4. Keep credit fulfillment webhook-only.

### Phase 4: Credited wallet confirmation

1. Add pending/verification/expired/failed/paid states.
2. Display updated wallet balance only after server confirms fulfillment.
3. Treat paid success as confirmed only when payment intent is paid and wallet fulfillment is available.
4. Add transaction/ledger link if available.

## Validation Plan

Run available commands after implementation:

```txt
pnpm lint
pnpm app:lint
pnpm app:build
pnpm web:build
```

If tests exist for billing after implementation:

```txt
pnpm test
```

After code changes, if `graphify-out/graph.json` exists, run:

```txt
graphify update .
```

## Key Rules and Risks

- Do not grant credits from client-side payment callbacks.
- Do not trust amount, credits, bonus credits, or expiry from client input.
- Do not put Supabase queries in pages, client components, or feature actions.
- Do not expose raw provider errors to users.
- Payment method choice and provider instructions should remain owned by Xendit Components unless a future provider response contract is added.
- UI package must stay presentational and provider-agnostic.
- Next.js route implementation must consult installed docs in `node_modules/next/dist/docs/` before coding.
