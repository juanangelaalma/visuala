# Xendit Visuala-Owned Payment Method Checkout Plan

## Objective and Scope

Implement one-time credit purchases with payment-method selection owned by Visuala and Xendit as the first provider. Use Xendit Payment Requests / Payments API v3 as the primary integration because QRIS, Virtual Account (VA), and later e-wallet selection must originate in Visuala rather than in Xendit Components.

Launch in phases:

1. Phase 1: QRIS only.
2. Phase 2: selected VA channels after QRIS fulfillment and reconciliation are stable.
3. Phase 3: selected e-wallets only after redirect/deep-link behavior, device handling, and operational support are validated.

Cards, subscriptions, refunds, disputes, and credit reversals are out of initial scope. Refund policy and reversal accounting remain production-launch dependencies.

This plan is authoritative for Visuala-owned checkout. It explicitly supersedes the Components-first and embedded-session recommendation in `docs/provider-agnostic-billing-credit-wallet-plan.md` for this checkout scope. That plan remains authoritative for provider isolation, wallet and ledger principles, pricing snapshots, and webhook-only fulfillment. Xendit Components may be evaluated later for a separate embedded-card scope; it is not the primary path here.

## Architecture and Trust Boundaries

Preserve the existing dependency direction:

```txt
UI / routes / actions
    → application
        → domain
            ← infrastructure implements domain contracts
```

Recommended locations:

```txt
apps/app/domain/billing
apps/app/domain/credits
apps/app/application/billing
apps/app/application/credits
apps/app/infrastructure/billing
apps/app/infrastructure/credits
apps/app/features/billing
apps/app/app/(dashboard)/billing
apps/app/app/api/billing/webhooks/xendit/route.ts
```

Responsibilities:

- UI and server actions accept only opaque internal IDs and render normalized data.
- Application use cases authenticate users, orchestrate checkout, and enforce business rules.
- Domain modules own provider-neutral models and repository/gateway contracts.
- Infrastructure contains Supabase access, Xendit API v3 payloads, callback verification, and provider mapping.
- A privileged database function owns atomic webhook mutation and credit fulfillment.
- Client redirects, polling, and refresh actions never grant credits or mutate provider/payment state.

## User Flow and Phased UX

1. An authenticated user opens billing and selects an active `pricing_plans` row.
2. The server lists enabled methods applicable to the plan amount, currency, environment, and launch phase.
3. The user submits `pricingPlanId`, opaque `paymentMethodCatalogId`, and a client-generated checkout idempotency key.
4. The server resolves all price, credit, owner, and provider mapping data; no financial value comes from the client.
5. Visuala creates a stable billing payment/order and an append-only provider attempt in `creating` state.
6. Visuala sends a Payment Requests / Payments API v3 request with a stable provider reference and provider idempotency key.
7. The provider attempt becomes `requires_action`, `pending`, or a terminal creation state, and stores normalized ordered `actions`.
8. Visuala renders QRIS first; VA instructions are enabled in phase 2; e-wallet redirects/deep links are enabled in phase 3.
9. A verified webhook is the only path that can mark a payment paid and grant credits.
10. Owner-scoped reads show Visuala state. A refresh action only reloads that state.

The UI must not claim credits are available until the immutable purchase ledger entry and wallet update have committed.

## Domain Model

### Stable Billing Payment and Append-Only Provider Attempts

Keep the internal purchase/order stable across ambiguous provider calls and retries. Record every outbound provider creation as a separate append-only attempt.

```ts
type BillingPaymentStatus =
  | "pending"
  | "requires_action"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

type ProviderAttemptStatus =
  | "creating"
  | "unknown"
  | "requires_action"
  | "pending"
  | "failed"
  | "expired";

type BillingPayment = {
  id: string;
  userId: string;
  pricingPlanId: string;
  status: BillingPaymentStatus;
  priceAmount: number;
  currency: "IDR";
  baseCredits: number;
  bonusCredits: number;
  creditExpiresInDays: number;
  selectedPaymentMethodCatalogId: string;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

The payment snapshots `priceAmount`, `currency`, `baseCredits`, `bonusCredits`, and `creditExpiresInDays` from `pricing_plans` at creation. Rename every proposed `creditPackageId` field to `pricingPlanId`; do not create a parallel credit-package source of truth.

Each provider attempt has a positive integer `attempt_number`. Enforce unique `(billing_payment_id, attempt_number)`. Create the next attempt while holding a row lock on its billing payment: read `max(attempt_number)`, insert exactly `max + 1`, and release the lock only when the transaction commits. This makes numbering deterministic under concurrent creation. The current attempt is the highest-numbered non-terminal attempt; if none exists, it is the highest-numbered attempt. This rule controls customer-visible actions and reconciliation scheduling, but it does not invalidate older attempts or authorize fulfillment by itself.

Each provider attempt snapshots:

- provider and provider environment;
- opaque catalog ID;
- effective provider method type, channel code, and mapping version/config needed for reconciliation;
- provider reference and outbound idempotency key;
- provider payment/request ID when known;
- normalized ordered `actions` and expiry;
- sanitized provider status and failure category;
- timestamps for creation, last reconciliation, and completion.

Historical attempts are never repointed when catalog mappings change.

### Payment Method Catalog Identity

The UI sees an opaque catalog `id`, `kind`, label, description, logo, limits, currency, and availability. It never submits or receives a raw Xendit channel/method code.

Provider mappings are server-only child rows keyed by catalog ID, provider, environment, and mapping version. The server resolves an enabled mapping during creation and snapshots the effective mapping onto the provider attempt. Catalog labels can change without changing identity; provider mapping changes apply only to new attempts.

Phase gates are explicit catalog/config state, not inferred from UI visibility:

- Phase 1 permits only QRIS mappings.
- Phase 2 permits approved VA bank channels.
- Phase 3 permits approved e-wallet channels.

### Safe Normalized Ordered Actions

Replace the single `CheckoutInstructions` union with an ordered action list. Multiple provider actions may apply to different devices or stages.

```ts
type CheckoutAction = {
  action:
    | "display_qr"
    | "display_code"
    | "display_account"
    | "open_url"
    | "copy_value";
  descriptor: string;
  value: string;
  deviceApplicability: "all" | "desktop" | "mobile";
  expiresAt: string | null;
};

type CreateProviderPaymentResult = {
  provider: "xendit";
  providerPaymentId: string | null;
  providerReference: string;
  status: ProviderAttemptStatus;
  actions: CheckoutAction[];
  expiresAt: string | null;
  rawProviderStatus: string;
};
```

Normalization requirements:

- Preserve provider order after filtering unsupported actions.
- Use fixed descriptors from the adapter or trusted server catalog; never render provider HTML.
- Treat `value` as plain text unless `action === "open_url"`.
- Permit URLs only after parsing with `URL` and matching an explicit scheme whitelist. Default allowed schemes are `https:` and approved e-wallet deep-link schemes documented per channel. Reject `http:`, `javascript:`, `data:`, `file:`, protocol-relative URLs, embedded credentials, and unknown schemes.
- Do not return provider secrets, API keys, callback tokens, raw payloads, or reusable client secrets in actions.
- Validate action count and value length before persistence and rendering.
- Redact expired actions from ordinary owner reads after the retention window.

## Provider Gateway and Verification

Use one provider-neutral gateway contract with clearly separated operations:

```ts
interface CheckoutProviderGateway {
  createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult>;
  retrievePayment(input: RetrieveProviderPaymentInput): Promise<RetrieveProviderPaymentResult>;
  verifyAndNormalizeWebhook(input: VerifyProviderWebhookInput): Promise<VerifiedBillingWebhook>;
}
```

`verifyAndNormalizeWebhook` owns both authenticity verification and payload normalization. Do not create a second application-level verifier with overlapping responsibility. Internal Xendit helper modules may parse tokens and payloads, but the route and application use case depend on this single gateway operation.

Recommended names matching repository conventions:

```txt
apps/app/application/billing/create-billing-checkout.ts
apps/app/application/billing/get-billing-payment.ts
apps/app/application/billing/list-billing-payment-methods.ts
apps/app/application/billing/handle-billing-webhook.ts
apps/app/application/billing/create-billing-service.ts
apps/app/infrastructure/billing/xendit-checkout-provider.ts
apps/app/infrastructure/billing/xendit-payment-method-mapper.ts
apps/app/features/billing/actions/billing-actions.ts
apps/app/features/billing/schemas/billing-schema.ts
apps/app/app/api/billing/webhooks/xendit/route.ts
```

### Mandatory Official-Documentation and Sandbox Spike

Official documentation reviewed for the phase-one adapter:

- [Create Payment Request](https://docs.xendit.co/apidocs/create-payment-request): `POST https://api.xendit.co/v3/payment_requests`.
- [Get Payment Request by ID](https://docs.xendit.co/apidocs/get-payment-request-by-id): `GET /v3/payment_requests/{payment_request_id}`; recovery requires a known provider ID.
- [API authentication](https://docs.xendit.co/docs/api-key): HTTP Basic authentication uses the secret API key as username and an empty password.
- [Payment Requests overview](https://docs.xendit.co/docs/payment-requests): adapter pins `api-version: 2024-11-11`.
- [Webhook verification](https://docs.xendit.co/docs/webhook-verification): callback token arrives in `x-callback-token`.

Docs-derived implementation facts: create has no documented idempotency header or reference lookup; phase-one QRIS sends `PAY`, `ID`, `IDR`, `AUTOMATIC`, `QRIS`, and empty `channel_properties`; only ordered `PRESENT_TO_CUSTOMER`/`QR_STRING` actions are accepted as bounded plain text. Fixtures are explicitly not sandbox-certified.

Unresolved sandbox items: account QRIS availability, exact create/retrieve fixture variants, expiry behavior, webhook event-family names and retry/ordering guarantees, duplicate callback behavior, and ambiguous create recovery after a provider ID is unavailable. Checkout and QRIS remain disabled by default until these are certified.

Before implementation, complete and review a provider spike against current official Xendit documentation and sandbox behavior. Record the exact values in this plan or a linked approved artifact; do not infer or invent them:

- API product name and version, creation endpoint and HTTP method, retrieval endpoint and lookup keys;
- authentication format and idempotency header/key semantics, scope, replay behavior, and retention;
- request fields for reference, amount, currency, method type/channel, callback/return URLs, and expiry;
- response identifiers and the exact provider status-to-domain status mapping;
- every supported QRIS, VA, and e-wallet action type, field mapping, ordering, device applicability, and safe URL/deep-link handling;
- webhook endpoint configuration, event families/types, callback authentication mechanism and header, payload identifiers, reference fields, amount/currency fields, status mapping, retry behavior, ordering guarantees, and event-ID guarantees;
- retrieval behavior for ambiguous creation, including whether reference or idempotency key lookup is supported and the exact not-found semantics.

The spike must preserve sandbox request/response fixtures with secrets and personal data removed and demonstrate create, retrieve, action rendering, paid callback, duplicate callback, and ambiguous-request recovery. Implementation is blocked until every mapping above has an official-document citation and sandbox evidence. Xendit-specific names remain in infrastructure.

## Outbound Creation, Idempotency, and Recovery

Checkout creation requires an authenticated user. The authenticated user ID comes from server auth, never form input. The action accepts only:

```ts
const createBillingCheckoutSchema = z.object({
  pricingPlanId: z.string().uuid(),
  paymentMethodCatalogId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});
```

Creation sequence:

1. Resolve the active pricing plan and eligible catalog mapping server-side.
2. Insert or return the same owner-scoped billing payment for unique `(user_id, idempotency_key)`.
3. Lock the billing payment row and create one provider attempt with `attempt_number = max(attempt_number) + 1`, a stable unique provider reference, and a provider idempotency key.
4. Mark the attempt `creating` before the network call.
5. Call Xendit once for that attempt.
6. On a definitive response, persist provider ID, status, actions, mapping snapshot, and expiry.
7. On timeout, connection reset, or ambiguous response, mark the attempt `unknown`; do not create a new provider request immediately.
8. Recover by retrieving with provider reference/idempotency key where supported. A worker or authenticated retry operation reconciles the existing attempt before a replacement attempt is permitted.
9. If replacement is required after a definitive not-found/failed result, append a new attempt with a new provider idempotency key while keeping the same billing payment.

Uniqueness must cover `(user_id, idempotency_key)`, `(billing_payment_id, attempt_number)`, `(provider, environment, provider_reference)`, `(provider, environment, provider_idempotency_key)`, and non-null `(provider, environment, provider_payment_id)`.

A paid webhook may validly refer to an older attempt after a newer attempt exists. The atomic fulfillment RPC identifies and locks the exact attempt by provider/environment plus provider payment ID and reference, validates it against the same billing payment, and may fulfill it under the transition matrix. Attempt recency is not a settlement-validity condition. The payment-level unique grant and purchase-ledger constraints make fulfillment exactly once; after one attempt pays, later paid events for any attempt of that payment are processed as idempotent duplicates, never add credits, and remain available for reconciliation audit. Non-paid events from older attempts may update only that attempt's observation and must not downgrade the payment or replace current customer-visible actions.

Provider creation failures return user-safe categories. Raw provider errors remain server-only and are sanitized before operational storage.

## Authenticated Retrieval and Read-Only Refresh

All checkout pages, payment detail use cases, and refresh actions require server authentication and query by both payment ID and authenticated owner ID. A UUID alone is never authorization. Repository methods exposed to user flows use signatures such as `findOwnedById(userId, paymentId)`.

`refresh-billing-payment-action` is read-only: it re-reads Visuala database state and returns a small owner-safe projection. It does not call Xendit, claim webhooks, update statuses, attach actions, or grant credits. Provider reconciliation runs only in a separately authorized server job/use case with bounded rate and audit logging.

Users may read only:

- their own billing payments and safe current actions;
- their own wallet, grants, and ledger entries;
- enabled public-safe catalog metadata.

They cannot read provider mappings, provider attempts' sensitive metadata, webhook events, callback material, or raw payloads.

## Webhook Normalization and HTTP Semantics

`x-callback-token` is Xendit's callback verification token header, not a user bearer token and not necessarily a cryptographic body signature. Store the expected token only in a server secret such as `XENDIT_WEBHOOK_TOKEN`; compare in constant time where practical. Reject a missing or invalid token before recording or mutating billing data. If a Xendit event type uses a different verification mechanism, the Xendit adapter must implement that documented mechanism explicitly.

A normalized webhook contains provider, environment, event type, provider reference/ID, normalized status, amount, currency, occurred time, and a derived `deduplicationKey`. Do not assume every Xendit payload has a universal event ID.

The adapter derives `deduplicationKey` using a documented versioned strategy:

1. Use a provider event ID only when the event family guarantees one.
2. Otherwise hash a canonical tuple of immutable fields such as provider environment, event family/type, provider payment/request ID, provider reference, normalized status, provider occurrence timestamp, amount, and currency.
3. Canonicalization uses stable field ordering, normalized strings/numbers, a strategy version prefix, and SHA-256.
4. Reject events lacking enough immutable identity fields; never use arrival time or the complete mutable/raw JSON as the sole identity.

The route reads the raw request where required, invokes `verifyAndNormalizeWebhook`, then invokes `handle-billing-webhook`. Responses:

- Invalid verification or malformed payload: `400` or `401`, stable safe body, no mutation.
- Successfully processed or already processed duplicate: `2xx` so Xendit stops retrying.
- Verified callback durably inserted/upserted for asynchronous processing: `2xx` only after durable receipt commits.
- Durable-receipt transaction failure: `5xx` so Xendit retries delivery.
- Worker fulfillment failures occur after the HTTP response and follow the internal retry/dead-letter lifecycle; they do not change the completed callback response.

Never return stack traces, DB errors, provider payloads, or token details.

## Resolved Webhook Topology and Lifecycle

The chosen topology is **durable receipt, then worker, with claim and fulfillment inside one atomic RPC**. This is a resolved implementation decision, not owner-dependent.

`billing_webhook_events.status` uses:

```txt
received | processed | failed
```

There is no persistent `processing` state and no lease. Therefore no claim token, claim generation, stale-claim recovery, or worker ownership record exists. A claim exists only as row locks inside the fulfillment RPC transaction; process death or transaction failure releases the locks and rolls back every claim and fulfillment change.

Required fields include `attempt_count`, `last_error_sanitized`, `received_at`, `processed_at`, `failed_at`, `next_attempt_at`, optional `dead_lettered_at`, and the minimum normalized payload needed for processing. A redacted or encrypted restricted payload is optional only under the approved retention policy.

Lifecycle:

1. The route reads the callback, authenticates it through `verifyAndNormalizeWebhook`, validates normalization, and durably inserts or upserts the receipt by unique `(provider, environment, deduplication_key)`. It returns `2xx` only after this transaction commits. Duplicate receipt delivery updates no authoritative settled fields and returns `2xx`.
2. A worker selects candidate IDs whose status is `received`, or `failed` with `next_attempt_at <= now()` and below the dead-letter threshold. Selection is advisory and grants no ownership.
3. For each candidate, the worker invokes one privileged atomic fulfillment RPC with the event ID. The RPC conditionally claims the row under lock only if it is still eligible, then locks the associated billing payment and exact provider attempt.
4. Inside the same transaction, the RPC validates provider, environment, reference, provider payment ID, amount, currency, normalized status, and event-to-attempt association; applies the allowed transition; inserts the unique grant and immutable ledger entry when paid; creates or locks and updates the wallet; and marks the event `processed`. Valid ignored, duplicate, or no-op events are also marked `processed` with a safe outcome code.
5. If any validation or write raises a retryable failure, the entire RPC transaction rolls back. The event remains in its prior `received` or retryable `failed` state; payment, attempt, grant, ledger, wallet, and event completion changes also roll back.
6. After that rollback, the worker invokes a separate conditional failure-recording operation. It updates only an event that remains eligible, increments `attempt_count`, stores a bounded sanitized error code/message, sets `failed_at`, and sets `next_attempt_at` using capped exponential backoff. At the configured maximum attempts it clears `next_attempt_at`, sets `dead_lettered_at`, and alerts operations.
7. If failure recording itself fails, the worker logs only the event ID, safe error category, and correlation ID, emits an operations alert/metric, and leaves the event unchanged. A later worker scan retries it because it is still `received` or retryable `failed`; no fulfillment can have partially committed. Do not acknowledge this worker execution as successful.
8. Concurrent workers are safe: only the RPC holding the event row lock can observe it as eligible and commit fulfillment. A second RPC waits, then returns an idempotent not-eligible/already-processed result.

Do not store secrets, callback headers, full customer data, raw provider payloads, or raw infrastructure exceptions in `last_error_sanitized`.

## Atomic Fulfillment Boundary

Every valid webhook state mutation, including paid fulfillment, must execute in one database transaction/RPC. The operation covers:

1. Conditionally claim the locked event only when its status is `received`, or retryable `failed` with `next_attempt_at <= now()` and below the dead-letter threshold.
2. Lock the billing payment row and relevant provider attempt.
3. Validate provider, environment, provider reference/ID association, expected amount, currency, and event-to-attempt mapping.
4. Apply the transition matrix conditionally.
5. Insert the unique `credit_grants` row for a paid transition.
6. Insert the immutable `credit_ledger_entries` purchase-grant row.
7. Create or lock and update `credit_wallets` with a non-negative balance invariant.
8. Mark the webhook event `processed` in the same commit.

Any mismatch or write failure rolls back the conditional claim and all state, including event completion. Failure metadata is written only afterward through the separate conditional operation defined above. A duplicate grant or already-applied transition returns an idempotent result without adding balance again. Application-level sequential repository calls are insufficient.

### Privileged Database Mutation Boundary

Recommended boundary: a narrowly scoped `SECURITY DEFINER` PostgreSQL RPC owned by a dedicated non-login role.

Security requirements:

- Set a fixed safe `search_path` such as `pg_catalog, public`, or an empty path where every object is schema-qualified.
- Schema-qualify tables, functions, operators where appropriate, and called routines.
- Revoke default/public execute privileges.
- Grant execute only to the dedicated server role used by trusted backend infrastructure.
- Do not grant direct execute to `anon` or `authenticated` unless a deliberate wrapper independently authenticates, authorizes, constrains all arguments, and exposes no arbitrary payment/event selection.
- Accept internal IDs and normalized validated values, then revalidate authoritative rows under lock; never trust client-supplied amount, owner, credits, or status.
- Restrict direct table mutation grants and retain RLS defense in depth.
- Audit function ownership and prevent mutable objects on its search path.

Service-role alternative: call a non-definer transactional function or direct transaction through a server-only DB connection using the Supabase service role. This is acceptable only if the credential never reaches clients, the connection can guarantee one transaction, inputs are equally constrained, and the role's broader blast radius is accepted and audited. The narrow definer RPC is preferred because it exposes less privilege.

## Transition Matrix

| Current payment state | Incoming normalized state | Result |
|---|---|---|
| `pending` | `pending` | No state change; update attempt observation only. |
| `pending` | `requires_action` | Move to `requires_action` if actionable data is valid and unexpired. |
| `pending` / `requires_action` | `paid` | Move to `paid`; grant once atomically. |
| `pending` / `requires_action` | `failed` | Move to `failed`; no grant. |
| `pending` / `requires_action` | `expired` | Move to `expired`; no grant. |
| `pending` / `requires_action` | `cancelled` | Move to `cancelled`; no grant. |
| `expired` | `paid` | Late-paid exception: move to `paid` and grant once after full validation; record late-payment audit metadata. |
| `failed` | `paid` | Allow only when provider semantics establish final settlement; move to `paid` and grant once, with audit metadata. |
| `cancelled` | `paid` | Do not auto-grant unless provider semantics and business policy explicitly permit it; quarantine for reconciliation by default. |
| `paid` | any non-paid state | No-op; never revoke or downgrade. |
| any state | duplicate equivalent event | No-op and mark event processed. |
| any state | unknown/ignored event | No payment mutation; mark event processed. |

Late paid after expiry must not be discarded because provider settlement can arrive after local expiry. Grant expiry is calculated from actual `paidAt` using the snapshotted `creditExpiresInDays`, unless the product owner later approves a different accounting policy.

## Database Design

Use append-only timestamped migrations. Database names remain `snake_case`; repository boundaries map to camelCase.

### `billing_payment_methods`

- `id uuid primary key default gen_random_uuid()`
- catalog kind/label/description/logo, currency, min/max amount, enabled, launch phase, sort order
- checks for allowed kind, currency, phase, non-negative limits, and `min_amount <= max_amount`
- unique stable internal slug only for operations; UI submits `id`
- `created_at`, `updated_at` with the project's standard trigger

### `billing_payment_method_provider_mappings`

- FK `payment_method_id` to catalog with restrictive delete behavior
- provider, environment, mapping version, provider method type/channel, server-only config, enabled
- unique `(payment_method_id, provider, environment, mapping_version)`
- partial unique active mapping where the chosen migration pattern supports it
- no user SELECT policy

### `billing_payments`

- FK `user_id` to `auth.users(id)` and `pricing_plan_id` to `public.pricing_plans(id)` with deliberate restrictive deletion
- snapshotted `price_amount > 0`, allowed currency, `base_credits >= 0`, `bonus_credits >= 0`, `credit_expires_in_days > 0`
- FK `selected_payment_method_id` to catalog
- checked status and coherent timestamp checks
- unique `(user_id, idempotency_key)`
- indexes `(user_id, created_at desc)`, `(user_id, status)`, `(status, created_at)`
- `updated_at` maintained by the standard trigger

### `billing_provider_attempts`

- FK payment and catalog mapping snapshot identity
- positive `attempt_number`, unique `(billing_payment_id, attempt_number)`, allocated as `max + 1` under a billing-payment row lock
- checked provider/environment/status; unique provider reference, idempotency key, and non-null provider payment ID per provider/environment
- `actions jsonb not null default '[]'` with application validation and optional DB shape guard
- indexes `(billing_payment_id, attempt_number desc)`, `(status, created_at)`, and reconciliation timestamps
- append-only attempt identity; updates limited to lifecycle fields

### `billing_webhook_events`

- unique `(provider, environment, deduplication_key)`
- checked lifecycle status `received | processed | failed` and non-negative `attempt_count`; no persistent processing/lease columns
- bounded sanitized error, timestamps, retry index `(status, next_attempt_at)`, and dead-letter timestamp/index
- provider references indexed for investigation
- no user access

### Credit Tables

Reuse `credit_wallets`, `credit_grants`, and immutable `credit_ledger_entries` from the provider-agnostic plan with:

- FKs to user, billing payment, and pricing plan;
- unique grant per billing payment;
- partial unique purchase ledger entry per billing payment;
- positive grant amounts, non-negative remaining/wallet balances, and coherent expiry checks;
- wallet row locking during fulfillment;
- no UPDATE or DELETE on ledger entries through application roles;
- compensating entries, not edits, for future reversals.

### RLS, Grants, and Revokes

Enable and force RLS where compatible with migration/ownership patterns. Define explicit owner SELECT policies using `auth.uid() = user_id` for payments, wallet, grants, and ledger. Define a safe enabled-catalog SELECT policy or expose catalog through a server use case. Provider mappings, attempts' restricted fields, and webhook events have no end-user policies.

Revoke INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER privileges from `anon` and `authenticated` on internal billing/credit tables. Grant only required SELECT access, or use server-mediated reads. Revoke function execute from `public` by default and grant the privileged RPC only as described above. Admin UI, if added, must use `requireAdmin()` and server-side services; RLS is not replaced by UI hiding.

### Retention and Redaction

- Keep payments, grants, and immutable ledger entries according to financial/audit policy; owner-facing views expose only safe fields.
- Retain webhook metadata and redacted payloads for a defined operational period, recommended 90 days initially, then purge or irreversibly redact payload while retaining deduplication/audit fields as policy permits.
- Remove or redact expired checkout actions after a short support window, recommended 30 days.
- Never persist callback tokens, Authorization headers, API keys, full provider responses, or unnecessary personal data.
- Encrypt restricted payloads if retention is legally/operationally required and limit access to operations roles.
- Document scheduled retention jobs and make deletion idempotent and auditable.

## Server Actions and Route Rules

`billing-actions.ts` starts with `"use server"`, uses `Object.fromEntries(formData)` and `schema.safeParse(...)`, calls application use cases only, and returns small user-safe states. Checkout creation and every payment read require the existing auth helper. Admin operations use `requireAdmin()`.

The webhook route is unauthenticated by user session but authenticated by Xendit's callback mechanism. It uses `Response.json(...)`, stable safe bodies, and the provider/application factory. It does not import repositories or perform credit mutations directly.

## Testing and Security Validation Plan

### Unit and Contract Tests

- Catalog eligibility by phase, amount, currency, environment, and enabled mapping.
- Opaque catalog IDs never expose or accept provider method codes.
- Pricing snapshots use `pricing_plans`; client financial fields are ignored/rejected.
- Ordered action normalization, count/length limits, device applicability, expiry, and URL/deep-link whitelist rejection.
- Xendit v3 request/response and retrieval mapping fixtures.
- `deduplicationKey` stability, versioning, collision-resistant canonical fields, missing-identity rejection, and event-ID/non-event-ID families.
- Callback-token missing/invalid/valid behavior without secret logging.
- User-safe error mapping.

### Auth, RLS, and Privilege Tests

- Anonymous users cannot create or retrieve checkout.
- User A cannot retrieve User B's payment by guessed UUID through page, action, repository, or direct RLS query.
- `anon` and `authenticated` cannot insert/update/delete billing, webhook, wallet, grant, or ledger rows.
- End users cannot read provider mappings, webhook events, restricted attempts, or retained payloads.
- End users cannot execute the privileged fulfillment RPC.
- The designated server role can execute only the intended RPC path.
- `SECURITY DEFINER` search-path/object qualification resists object-shadowing attacks.
- Admin paths require `requireAdmin()`.

### Idempotency and Concurrency Tests

- Concurrent checkout submissions with one client idempotency key produce one payment and one initial attempt.
- Ambiguous provider timeout produces `unknown`, then retrieval recovers without duplicate provider creation.
- Concurrent duplicate webhooks produce one claim, one grant, one ledger entry, and one wallet increment.
- Different webhook identities for the same paid payment still grant once.
- Concurrent workers cannot persist or steal claims because eligibility and row locking exist only inside the RPC transaction.
- Worker termination or failure between every atomic fulfillment step rolls back event eligibility/claim, payment, attempt, grant, ledger, wallet, and event completion.
- The separate failure recorder increments once conditionally, schedules retry/dead-letter correctly, and a failure of that recorder leaves the receipt eligible for a later scan without duplicate fulfillment.
- A paid webhook for an older attempt after a newer attempt exists fulfills once; subsequent paid attempts are audit-visible idempotent no-ops, and older non-paid events cannot replace current actions or downgrade payment.
- Repeated paid fulfillment returns idempotent success.
- Amount, currency, reference, provider ID, or environment mismatch grants nothing and records a sanitized failure.
- Paid-after-expired follows the approved late-paid transition and grants once.
- Paid-after-cancelled is quarantined by default.
- Out-of-order paid then failed/expired never downgrades paid.
- Refresh action performs no writes and no provider call.

### Database and Operational Tests

- All FKs, checks, uniques, partial indexes, timestamps, and restrictive delete behavior work as specified.
- Ledger mutation is denied and reversal requires a new compensating entry.
- Retention removes/redacts only eligible payload/actions and preserves deduplication and financial audit invariants.
- Webhook `2xx`/`4xx`/`5xx` behavior matches retry policy.
- Sandbox QRIS completes end to end before VA enablement; each VA channel is certified separately.

## Implementation-Time Environment and Configuration Checklist

Complete this checklist for local, preview/staging, and production before enabling checkout. Every secret is server-only and must be validated at startup or factory construction without logging its value.

- [ ] Xendit API key configured as a server-only secret; never use a `NEXT_PUBLIC_` name or expose it to client bundles, actions, responses, logs, or retained payloads.
- [ ] Xendit webhook callback token configured separately as a server-only secret and registered for the exact callback endpoint/environment.
- [ ] Explicit provider environment configured and checked against every mapping, outbound request, retrieval, and webhook receipt; fail closed on mismatch.
- [ ] Global checkout kill switch and environment-specific enable flag configured.
- [ ] Phase/method flags configured for QRIS, each VA channel, and each e-wallet channel; disabled by default until certified.
- [ ] Initial user allowlist configured server-side with documented graduation/removal criteria.
- [ ] Worker scan interval, batch size, concurrency, request timeout, capped exponential retry base/max delay, maximum attempts, and dead-letter threshold configured.
- [ ] Because this topology has no persistent processing lease, no lease duration is configured. Any future leased topology requires a separately reviewed claim-token/generation design and plan revision.
- [ ] Dead-letter alerts, failure-recording-failure alerts, reconciliation alerts, dashboards, and operational ownership configured.
- [ ] Callback URL, application return URLs, and allowed action/deep-link schemes configured per environment from the approved provider spike.
- [ ] Restricted payload retention/redaction and checkout-action retention periods configured to the approved policy.

## Exact Validation Commands

Run after implementation from the workspace root:

```bash
pnpm app:lint
pnpm app:build
pnpm --filter app test
```

Run type checking only if the relevant root or `app` workspace `package.json` exposes a typecheck script. Inspect scripts first, then run the exact existing script with pnpm; do not invent one. Also run targeted billing tests and migration/database tests where available. Documentation-only revisions require `git diff --check` and, when `graphify-out/graph.json` exists, `graphify update .`.

## Rollout

### Phase 1: QRIS

- Add billing/order, attempt, catalog mapping, webhook lifecycle, wallet/ledger, RLS, and privileged RPC foundation.
- Implement Xendit Payment Requests / Payments API v3 QRIS creation, retrieval, and verified webhook normalization.
- Enable behind a global/environment feature flag and limited user allowlist.
- Validate duplicate, delayed, out-of-order, mismatch, concurrent-worker, RPC rollback, failure-recording failure, and timeout recovery scenarios.

### Phase 2: Virtual Accounts

- Add approved bank mappings and VA-specific normalized actions.
- Define bank-specific expiry and late-payment behavior.
- Certify each channel in sandbox and production-limited rollout before broad enablement.

### Phase 3: E-wallets

- Add only approved redirect/deep-link schemes and device applicability.
- Validate mobile/desktop fallback, return UX, expiry, and callback behavior per channel.

Admin catalog UI is deferred; initial catalog/mapping changes use reviewed migrations or controlled server operations.

## Approved Recommendations and Residual Owner Decisions

The following recommendations are approved for this implementation plan:

1. Primary Xendit path: Payment Requests / Payments API v3, not Components-first.
2. Launch order: QRIS first, then VA, then separately approved e-wallets.
3. Catalog: database-backed from day one with opaque IDs and server-only mappings.
4. Pricing source: existing `pricing_plans`; use `pricingPlanId` and mandatory snapshots.
5. Multiple pending payments: allowed only through distinct client idempotency keys; reuse the same payment for retries of one key. Apply reasonable per-user creation/rate limits.
6. Checkout feature flags: environment/global kill switch plus an initial user allowlist.
7. Admin catalog UI: deferred from phase one.
8. Refunds/reversals: excluded from MVP domain behavior, but immutable compensating ledger entries are the required future model.
9. Webhook processing topology: authenticate and durably upsert a receipt in the route, then let a worker invoke one RPC that conditionally claims and atomically fulfills it. No persistent `processing` state or lease exists; post-rollback failure recording is a separate conditional operation.
10. Late paid after expiry: accept after full validation and grant once; audit as late settlement.
11. Refresh action: database read only.
12. Gateway/verifier design: one gateway operation verifies and normalizes; no overlapping application verifier.

Truly owner-dependent decisions remaining before production:

1. Exact QRIS, VA, and e-wallet commercial channel availability in the Xendit account.
2. Method-specific payment expiry windows and customer-facing instruction copy.
3. Final refund, dispute, and credit-reversal policy.
4. Regulatory/audit retention periods and whether restricted webhook payloads may be stored at all.
5. Whether paid-after-cancelled should ever auto-fulfill rather than remain quarantined.
6. Final values for production allowlist graduation criteria and operational retry/alert/dead-letter thresholds; the topology and required configuration points are already resolved.

## Implementation File Scope

Likely implementation files, subject to inspection of existing local patterns:

```txt
apps/app/domain/billing/**
apps/app/domain/credits/**
apps/app/application/billing/**
apps/app/application/credits/**
apps/app/infrastructure/billing/**
apps/app/infrastructure/credits/**
apps/app/features/billing/actions/billing-actions.ts
apps/app/features/billing/schemas/billing-schema.ts
apps/app/features/billing/components/**
apps/app/app/(dashboard)/billing/**
apps/app/app/api/billing/webhooks/xendit/route.ts
apps/app/supabase/migrations/<timestamp>_create_billing_checkout.sql
```

Implementation must inspect existing factories, auth helpers, pricing repositories, migration conventions, and installed Next.js documentation before code changes.