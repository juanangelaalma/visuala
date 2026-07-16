# Provider-Agnostic Billing and Credit Wallet Implementation Plan

## Objective

Add provider-agnostic embedded billing checkout for Visuala, with Xendit Payment Session Components as the first payment provider integration and an internal credit wallet/ledger as the source of truth for user credits.

Primary goals:

- Keep Xendit isolated in infrastructure adapters.
- Keep the user inside Visuala during checkout using embedded payment components.
- Make future payment provider migration low-risk.
- Keep credit wallet independent from payment provider details.
- Process payment webhooks securely and idempotently.
- Follow Visuala layered architecture: routes/actions -> application -> domain <- infrastructure.

---

## 1. Design Principles

- Payment providers are replaceable adapters.
- Application use cases depend on domain interfaces, not provider SDKs or HTTP payloads.
- Credit balance is internal application state, not stored in Xendit.
- Ledger entries are the audit source of truth.
- Wallet balances are cached/snapshot state derived from ledger operations.
- Credit grants are tracked separately to support expiry and FIFO usage.
- Embedded checkout is the primary UX; hosted payment links can remain a fallback.
- Webhook fulfillment is the only trusted path for granting credits.
- Client-side payment success callbacks are UX only and must not grant credits.

Recommended top-level structure:

```txt
apps/app/domain/billing
apps/app/domain/credits
apps/app/application/billing
apps/app/application/credits
apps/app/infrastructure/billing
apps/app/infrastructure/credits
apps/app/features/billing
```

---

## 2. Provider Abstraction

Define a provider-agnostic checkout contract in `domain/billing`.

```ts
export interface CheckoutProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>;
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifiedBillingWebhook>;
}
```

Normalized checkout result:

```ts
type CheckoutSessionResult = {
  provider: BillingProvider;
  providerPaymentId: string;
  providerReference: string;
  checkoutMode: "embedded" | "hosted";
  providerClientSecret: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
};
```

Normalized webhook event:

```ts
type VerifiedBillingWebhook = {
  provider: BillingProvider;
  eventId: string;
  eventType: string;
  providerPaymentId: string | null;
  providerReference: string;
  status: "paid" | "expired" | "failed" | "ignored";
  amount: number | null;
  currency: string | null;
  rawPayload: unknown;
};
```

Xendit-specific behavior stays in:

```txt
apps/app/infrastructure/billing/xendit-checkout-provider.ts
```

Future providers can be added as:

```txt
apps/app/infrastructure/billing/midtrans-checkout-provider.ts
apps/app/infrastructure/billing/stripe-checkout-provider.ts
```

The application layer should not need to change when switching providers if the new adapter implements `CheckoutProvider`.

---

## 3. Domain Boundaries

### `domain/billing`

Responsibilities:

- Payment intent/order model.
- Provider-agnostic checkout status.
- Checkout provider interface.
- Billing repository interfaces.
- Billing domain errors.

Suggested types:

```ts
type BillingProvider = "xendit";

type BillingPaymentStatus =
  | "pending"
  | "paid"
  | "expired"
  | "failed"
  | "cancelled";
```

Suggested repository interfaces:

```ts
interface PaymentIntentRepository {
  createPending(input: CreatePendingPaymentIntentInput): Promise<PaymentIntent>;
  findById(id: string): Promise<PaymentIntent | null>;
  findByProviderReference(provider: BillingProvider, reference: string): Promise<PaymentIntent | null>;
  markProviderCreated(input: MarkProviderCreatedInput): Promise<PaymentIntent>;
  markPaid(input: MarkPaidInput): Promise<PaymentIntent>;
  markExpired(input: MarkExpiredInput): Promise<PaymentIntent>;
  markFailed(input: MarkFailedInput): Promise<PaymentIntent>;
}

interface BillingWebhookEventRepository {
  recordReceived(input: RecordWebhookEventInput): Promise<RecordWebhookEventResult>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}
```

### `domain/credits`

Responsibilities:

- Wallet balance model.
- Credit grant model.
- Ledger entry model.
- Credit repository interfaces.
- Credit domain errors.

Suggested entry types:

```ts
type CreditLedgerEntryType =
  | "purchase_grant"
  | "usage_debit"
  | "reservation"
  | "reservation_release"
  | "refund_reversal"
  | "manual_adjustment"
  | "expiration";
```

Suggested repository interface:

```ts
interface CreditWalletRepository {
  getBalance(userId: string): Promise<CreditBalance>;
  grantPurchasedCredits(input: GrantPurchasedCreditsInput): Promise<void>;
  debitCredits(input: DebitCreditsInput): Promise<void>;
  hasGrantForPaymentIntent(paymentIntentId: string): Promise<boolean>;
}
```

---

## 4. Database Plan

Create an append-only migration under:

```txt
apps/app/supabase/migrations/YYYYMMDDHHMMSS_create_billing_and_credit_wallet.sql
```

### `billing_payment_intents`

Purpose: internal payment/order state.

Columns:

```txt
id uuid primary key default gen_random_uuid()
user_id uuid not null references auth.users(id)
pricing_plan_id uuid not null references public.pricing_plans(id)
provider text not null
provider_payment_id text
provider_reference text
status text not null
amount integer not null check (amount >= 0)
currency text not null
checkout_mode text not null default 'embedded'
provider_client_secret text
checkout_url text
credits integer not null check (credits >= 0)
bonus_credits integer not null default 0 check (bonus_credits >= 0)
credit_expires_in_days integer not null check (credit_expires_in_days > 0)
idempotency_key text not null unique
metadata jsonb not null default '{}'
paid_at timestamptz
expires_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Indexes/constraints:

```txt
index(user_id, created_at desc)
index(provider, provider_payment_id)
index(status, created_at)
unique(provider, provider_payment_id) where provider_payment_id is not null
```

Rationale:

- Snapshot plan credits and price at checkout time.
- Protect users from later pricing plan changes.
- Keep provider IDs for reconciliation.

### `billing_webhook_events`

Purpose: idempotency and audit for provider webhooks.

Columns:

```txt
id uuid primary key default gen_random_uuid()
provider text not null
event_id text not null
event_type text not null
provider_payment_id text
provider_reference text
payload jsonb not null
signature_valid boolean not null default false
processed_at timestamptz
processing_error text
created_at timestamptz not null default now()
```

Constraints:

```txt
unique(provider, event_id)
```

### `credit_wallets`

Purpose: cached wallet balance per user.

Columns:

```txt
user_id uuid primary key references auth.users(id)
available_balance integer not null default 0 check (available_balance >= 0)
reserved_balance integer not null default 0 check (reserved_balance >= 0)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### `credit_grants`

Purpose: per-purchase credit lots for expiry and FIFO usage.

Columns:

```txt
id uuid primary key default gen_random_uuid()
user_id uuid not null references auth.users(id)
payment_intent_id uuid not null references public.billing_payment_intents(id)
original_amount integer not null check (original_amount > 0)
remaining_amount integer not null check (remaining_amount >= 0)
expires_at timestamptz not null
created_at timestamptz not null default now()
```

Constraints/indexes:

```txt
unique(payment_intent_id)
index(user_id, expires_at)
index(user_id, remaining_amount)
```

### `credit_ledger_entries`

Purpose: immutable credit audit trail.

Columns:

```txt
id uuid primary key default gen_random_uuid()
user_id uuid not null references auth.users(id)
amount integer not null check (amount <> 0)
entry_type text not null
source_type text not null
source_id text
payment_intent_id uuid references public.billing_payment_intents(id)
pricing_plan_id uuid references public.pricing_plans(id)
balance_after integer not null check (balance_after >= 0)
metadata jsonb not null default '{}'
created_at timestamptz not null default now()
```

Recommended unique guard:

```txt
unique(payment_intent_id, entry_type) for purchase_grant
```

If partial unique constraints are used:

```sql
create unique index credit_ledger_purchase_grant_once
on public.credit_ledger_entries(payment_intent_id)
where entry_type = 'purchase_grant';
```

---

## 5. RLS Plan

User-readable tables:

```txt
billing_payment_intents
credit_wallets
credit_grants
credit_ledger_entries
```

User policy:

- Users can select only rows where `user_id = auth.uid()`.
- Users cannot insert/update/delete billing or credit rows directly.

Service/admin-only mutation tables:

```txt
billing_payment_intents
billing_webhook_events
credit_wallets
credit_grants
credit_ledger_entries
```

Admin tooling, if added later, must use existing `requireAdmin()` helpers.

---

## 6. Application Use Cases

### `create-billing-checkout.ts`

Location:

```txt
apps/app/application/billing/create-billing-checkout.ts
```

Flow:

1. Get authenticated user from auth helper.
2. Resolve pricing plan from slug or ID.
3. Ensure plan is active.
4. Create internal `billing_payment_intents` with status `pending`.
5. Snapshot `amount`, `currency`, `credits`, `bonusCredits`, and `creditExpiresInDays`.
6. Call `CheckoutProvider.createCheckoutSession`.
7. Store provider payment/session ID, provider reference, checkout mode, provider client secret, optional checkout URL, and expiry.
8. Return user-safe embedded checkout data for the Visuala checkout page.

Rules:

- Never trust amount or credits from client input.
- Use pricing plan values from the database.
- Keep Xendit payload construction outside this use case.
- Return generic embedded checkout data; do not expose Xendit-specific field names to application consumers.

### `handle-billing-webhook.ts`

Location:

```txt
apps/app/application/billing/handle-billing-webhook.ts
```

Flow:

1. Accept raw body and headers from route handler.
2. Call `CheckoutProvider.verifyWebhook`.
3. Insert row into `billing_webhook_events`.
4. If duplicate event already processed, return success.
5. Load payment intent by `providerReference` or `providerPaymentId`.
6. Validate amount/currency if present.
7. If status is `paid`:
   - If payment intent already `paid`, no-op.
   - Mark payment intent as paid.
   - Grant purchased credits.
   - Mark webhook event processed.
8. If status is `expired`:
   - Mark payment intent expired.
   - Mark webhook event processed.
9. If status is `failed`:
   - Mark payment intent failed.
   - Mark webhook event processed.
10. If status is `ignored`, mark processed without mutating payment or credits.

Atomicity requirement:

- Marking payment as paid and granting credits must happen in one transaction/RPC.

### `grant-purchased-credits.ts`

Location:

```txt
apps/app/application/credits/grant-purchased-credits.ts
```

Flow:

1. Compute total credits:

```ts
const totalCredits = paymentIntent.credits + paymentIntent.bonusCredits;
```

2. Compute expiry from `creditExpiresInDays`.
3. Ensure no previous grant for this `paymentIntent.id`.
4. Insert `credit_grants`.
5. Insert `credit_ledger_entries` with `entry_type = "purchase_grant"`.
6. Upsert/update `credit_wallets`.
7. Commit atomically.

### Future credit usage use cases

```txt
apps/app/application/credits/reserve-credits.ts
apps/app/application/credits/consume-reserved-credits.ts
apps/app/application/credits/release-reserved-credits.ts
apps/app/application/credits/debit-credits.ts
apps/app/application/credits/get-credit-balance.ts
```

Reservation pattern:

1. Reserve credits before expensive AI/generation job.
2. Consume reserved credits when job succeeds.
3. Release reserved credits if job fails due to system/provider failure.

---

## 7. Xendit Adapter Plan

Location:

```txt
apps/app/infrastructure/billing/xendit-checkout-provider.ts
```

Responsibilities:

- Create Xendit Payment Session in `COMPONENTS` mode by default.
- Return Xendit `components_sdk_key` as generic `providerClientSecret`.
- Optionally support `PAYMENT_LINK` as a fallback hosted checkout mode.
- Verify Xendit webhook token.
- Map Xendit webhook event to provider-agnostic `VerifiedBillingWebhook`.
- Keep all Xendit-specific payloads, headers, URLs, and field names here.

Create session endpoint:

```txt
POST https://api.xendit.co/sessions
```

Basic Auth:

```txt
username = XENDIT_SECRET_KEY
password = empty
```

Example Xendit request body for embedded checkout:

```json
{
  "reference_id": "payment_intent_<id>",
  "session_type": "PAY",
  "mode": "COMPONENTS",
  "amount": "100000",
  "currency": "IDR",
  "country": "ID",
  "locale": "id",
  "description": "Visuala Pro Plan",
  "customer": {
    "reference_id": "user_<id>",
    "type": "INDIVIDUAL",
    "email": "user@example.com",
    "individual_detail": {
      "given_names": "User"
    }
  },
  "items": [
    {
      "reference_id": "plan_pro",
      "type": "DIGITAL_SERVICE",
      "name": "Visuala Pro Plan",
      "net_unit_amount": "100000",
      "quantity": 1,
      "category": "AI Credits"
    }
  ],
  "components_configuration": {
    "origins": [
      "https://visuala.io"
    ]
  }
}
```

Expected Xendit response for embedded checkout:

```txt
payment_session_id
components_sdk_key
status = ACTIVE
```

Adapter maps response to:

```txt
checkoutMode = "embedded"
providerClientSecret = components_sdk_key
checkoutUrl = null
```

Webhook mapping:

```txt
payment_session.completed -> paid
payment_session.expired   -> expired
unknown event              -> ignored
invalid token              -> reject
```

Webhook verification:

- Read `x-callback-token` header.
- Compare with `XENDIT_WEBHOOK_TOKEN`.
- Reject before any mutation if invalid.

---

## 8. Server Action and Route Plan

### Checkout server action

Locations:

```txt
apps/app/features/billing/actions/create-checkout-action.ts
apps/app/features/billing/schemas/checkout-schema.ts
```

Rules:

- Action file starts with `"use server"`.
- Validate form input with Zod.
- Use `Object.fromEntries(formData)`.
- Return small user-safe state.

Suggested return shape:

```ts
type CreateCheckoutActionState = {
  error?: string;
  paymentIntentId?: string;
  checkoutMode?: "embedded" | "hosted";
  providerClientSecret?: string;
  checkoutUrl?: string;
};
```

Input:

```txt
pricingPlanSlug or pricingPlanId
```

Recommended:

- UI sends `pricingPlanSlug`.
- Server resolves active plan.

### Embedded checkout page

Recommended route:

```txt
apps/app/app/billing/checkout/[paymentIntentId]/page.tsx
```

Responsibilities:

- Require authenticated user.
- Load payment intent owned by the user.
- Pass generic `providerClientSecret` to a client component that mounts the Xendit Components SDK.
- Show payment progress and post-payment verification state.
- Never grant credits from client-side completion callbacks.

The client component can be provider-specific at the infrastructure/UI edge if needed, but domain/application naming should remain generic.

### Xendit webhook route

Location:

```txt
apps/app/app/api/billing/xendit/webhook/route.ts
```

Responsibilities:

- Read raw request body.
- Pass raw body + headers to application use case.
- Return stable response:

```ts
Response.json({ received: true })
```

Rules:

- No user auth required.
- Never expose internal errors.
- Verify webhook before mutation.
- Use server-only services.
- Before implementation, consult installed Next.js route handler docs in `node_modules/next/dist/docs/`.

---

## 9. Idempotency Strategy

Use three layers.

### 1. Webhook event uniqueness

```txt
unique(provider, event_id)
```

Duplicate webhooks return success without duplicate processing.

### 2. Payment status transition guard

Allowed transitions:

```txt
pending -> paid
pending -> expired
pending -> failed
paid -> no-op
expired -> no-op
failed -> no-op
```

### 3. Credit grant uniqueness

```txt
unique(payment_intent_id) in credit_grants
unique payment_intent_id where credit_ledger_entries.entry_type = 'purchase_grant'
```

This prevents duplicate credit grants even if webhook processing is retried.

---

## 10. Atomic Transaction / RPC Recommendation

Create a database transaction or RPC for the paid fulfillment path.

Suggested RPC behavior:

```txt
grant_credits_for_paid_payment_intent(payment_intent_id)
```

Responsibilities:

1. Lock payment intent row.
2. Ensure status is not already paid/granted.
3. Mark payment intent paid.
4. Upsert wallet.
5. Insert credit grant.
6. Insert ledger entry.
7. Update wallet balance.
8. Return success.

Why:

- Prevent payment marked paid but credits missing.
- Prevent credits granted while payment status remains pending.
- Prevent race conditions from webhook retries.

---

## 11. Environment Variables

Required:

```txt
XENDIT_SECRET_KEY
XENDIT_WEBHOOK_TOKEN
XENDIT_COMPONENTS_ORIGIN=https://visuala.io
XENDIT_COUNTRY=ID
XENDIT_CURRENCY=IDR
```

Rules:

- Do not expose these with `NEXT_PUBLIC_`.
- Do not log secret values.
- Validate env presence at service creation.

---

## 12. Security Checklist

- Checkout creation requires authenticated user.
- User ID comes from auth context, never form input.
- Amount and credits come from server-side pricing plan.
- Embedded checkout page requires authenticated user and only loads payment intents owned by that user.
- Client-side payment completion is not trusted for credit fulfillment.
- Webhook route verifies `x-callback-token` before DB mutation.
- Webhook route does not require user session.
- Provider raw payload is stored only for server-side audit.
- Billing and credit mutations are server-only.
- Users can only read their own wallet, grants, ledger, and payment intents.
- Admin mutations must call `requireAdmin()`.
- Xendit API key and callback token are server-only env vars.

---

## 13. Testing Plan

### Unit tests

Billing checkout:

- Creates pending payment intent for active plan.
- Rejects missing/inactive plan.
- Uses server-side amount and credit values.
- Stores plan snapshot.
- Maps provider errors to user-safe errors.

Webhook:

- Rejects invalid Xendit callback token.
- Inserts webhook event once.
- Duplicate completed webhook is no-op.
- Completed webhook marks payment paid.
- Completed webhook grants credit exactly once.
- Expired webhook marks payment expired.
- Amount/currency mismatch rejects fulfillment.
- Unknown event is safely ignored.

Credits:

- Purchased grant creates wallet if missing.
- Purchased grant increments wallet balance.
- Purchased grant creates ledger entry.
- Duplicate payment intent cannot grant twice.
- Debit fails on insufficient balance.
- Debit uses oldest expiring grants first.

### Validation commands after implementation

```txt
pnpm app:lint
pnpm app:build
pnpm --filter app test
```

If `graphify-out/graph.json` exists after code changes:

```txt
graphify update .
```

---

## 14. Rollout Phases

### Phase 1 — Foundation

- Add billing domain interfaces and types.
- Add credits domain interfaces and types.
- Add Supabase migration for billing and credit tables.
- Add RLS policies and indexes.
- Add Supabase repositories.

Deliverable: internal model and persistence exist.

### Phase 2 — Xendit adapter

- Add `XenditCheckoutProvider`.
- Add env validation.
- Add Xendit Payment Session creation.
- Add Xendit webhook verifier.
- Add Xendit event mapper.

Deliverable: provider-agnostic interface backed by Xendit.

### Phase 3 — Embedded checkout creation

- Add checkout schema.
- Add checkout server action.
- Add `createBillingCheckout` use case.
- Wire pricing selection to checkout.
- Add internal Visuala checkout page.
- Mount Xendit Components using generic `providerClientSecret` returned by the use case.

Deliverable: authenticated user can complete checkout inside Visuala without leaving the app.

### Phase 4 — Webhook and credit grant

- Add Xendit webhook route.
- Add `handleBillingWebhook` use case.
- Add atomic paid-to-credit grant operation.
- Add idempotency safeguards.
- Validate with Xendit sandbox.

Deliverable: paid checkout grants wallet credits exactly once.

### Phase 5 — Wallet UI

- Add get balance use case.
- Show balance in dashboard/navbar/account area.
- Optional transaction history page.

Deliverable: users can see credit balance.

### Phase 6 — Hardening

- Add reconciliation for stale pending payments.
- Add credit expiration handling.
- Add refund/reversal support.
- Add admin observability if needed.

Deliverable: production-grade operations.

---

## 15. Files Likely Added

```txt
apps/app/domain/billing/**
apps/app/domain/credits/**
apps/app/application/billing/**
apps/app/application/credits/**
apps/app/infrastructure/billing/**
apps/app/infrastructure/credits/**
apps/app/features/billing/actions/**
apps/app/features/billing/schemas/**
apps/app/app/api/billing/xendit/webhook/route.ts
apps/app/supabase/migrations/*_create_billing_and_credit_wallet.sql
```

Existing pricing files to reuse:

```txt
apps/app/domain/pricing/**
apps/app/application/pricing/**
apps/app/infrastructure/pricing/**
```

---

## 16. Risks and Mitigations

### Duplicate credits from webhook retry

Mitigation:

- Unique webhook event.
- Unique credit grant by payment intent.
- Atomic transaction/RPC.

### Provider lock-in

Mitigation:

- Xendit lives only in infrastructure adapter.
- Application depends on `CheckoutProvider`.
- Normalized webhook event shape.

### Pricing changes after checkout

Mitigation:

- Snapshot price, credits, bonus credits, and expiry days in payment intent.

### Partial payment/credit state

Mitigation:

- Mark paid and grant credits in one transaction/RPC.

### Invalid or forged webhook

Mitigation:

- Verify `x-callback-token` before mutation.
- Store signature validation state.

### Credit expiry complexity

Mitigation:

- Use `credit_grants` from phase 1.
- Debit oldest expiring grants first.

### Refund/dispute handling not included in MVP

Mitigation:

- Add reversal ledger entries in hardening phase.
- Define refund policy before production.

---

## 17. Decisions Before Coding

Recommended decisions:

1. Strict credit expiry from day one: yes, use `credit_grants`.
2. Snapshot plan details at checkout: yes, mandatory.
3. First payment model: one-time credit purchase.
4. Subscription: defer until wallet and ledger are stable.
5. Admin UI: defer until core flow works.
6. Refund policy: define before production launch.
7. Provider abstraction: mandatory via `CheckoutProvider`.

---

## 18. Final Recommendation

Implement MVP as one-time embedded Xendit Payment Session Components checkout with internal credit wallet and ledger.

The durable architecture is:

```txt
User checkout in Visuala
  -> application billing use case
  -> CheckoutProvider interface
  -> Xendit adapter
  -> Xendit Components mounted in Visuala checkout page
  -> Xendit webhook
  -> normalized billing webhook
  -> payment intent paid
  -> internal credit grant
  -> wallet + ledger update
```

This keeps Visuala ready for a future provider change. To replace Xendit, add a new adapter implementing `CheckoutProvider`, update provider factory/config, and keep credit wallet/use cases unchanged.
