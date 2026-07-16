# Billing and Credit Wallet Database Flow

This document explains the end-to-end database flow for provider-agnostic embedded billing checkout and internal credit wallet fulfillment. The primary checkout UX uses Xendit Payment Session Components so users can pay inside Visuala without leaving the app.

Related documents:

- `docs/provider-agnostic-billing-credit-wallet-plan.md`
- `docs/billing-credit-wallet.dbml`

---

## Overview

Main actors:

```txt
User
Visuala App
Xendit
Database
```

High-level flow:

```txt
1. User selects a pricing plan
2. Visuala creates an internal payment intent
3. Visuala creates a Xendit Payment Session in COMPONENTS mode
4. Visuala renders Xendit Components inside the Visuala checkout page
5. User pays without leaving Visuala
6. Xendit sends webhook
7. Visuala verifies webhook
8. Visuala matches webhook to payment intent
9. Visuala marks payment as paid
10. Visuala grants credits
11. User sees updated credit balance
```

Important rule:

```txt
Credits are granted only from verified provider webhooks, never from client-side payment completion callbacks.
```

---

## 1. User selects a plan

Example plan:

```txt
Pro Plan
Rp100.000
1000 credits
200 bonus credits
expires in 30 days
```

UI sends minimal input:

```txt
pricingPlanSlug = pro
```

or:

```txt
pricingPlanId = <uuid>
```

### Database read

Table:

```txt
pricing_plans
```

Fields read:

```txt
id
slug
name
price_amount
currency
credits
bonus_credits
credit_expires_in_days
is_active
```

Validation:

```txt
is_active = true
```

Client must not send `amount`, `credits`, `bonus_credits`, or `credit_expires_in_days`. Those values must come from the database.

---

## 2. Visuala creates internal payment intent

Before calling Xendit, Visuala creates an internal payment/order record.

### Database insert

Table:

```txt
billing_payment_intents
```

Inserted values:

```txt
id = generated uuid
user_id = auth.uid()
pricing_plan_id = pricing_plans.id
provider = "xendit"
provider_payment_id = null
provider_reference = "payment_intent_<id>"
status = "pending"

amount = pricing_plans.price_amount
currency = pricing_plans.currency

checkout_mode = "embedded"
provider_client_secret = null
checkout_url = null

credits = pricing_plans.credits
bonus_credits = pricing_plans.bonus_credits
credit_expires_in_days = pricing_plans.credit_expires_in_days

idempotency_key = generated key
metadata = {
  "plan_slug": "pro",
  "plan_name": "Pro Plan"
}

paid_at = null
expires_at = null
created_at = now()
updated_at = now()
```

Why this happens before Xendit:

- Visuala needs an internal source of truth.
- Visuala needs a stable reference to match future webhooks.
- Pricing and credit terms must be snapshotted before checkout.

---

## 3. Visuala creates Xendit Payment Session

Visuala calls Xendit from the server through the Xendit billing provider adapter.

Primary mode is embedded checkout using Xendit Components:

```txt
mode = "COMPONENTS"
```

Example Xendit payload:

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
      "reference_id": "pro",
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

Expected Xendit response:

```txt
payment_session_id
components_sdk_key
expires_at
status = ACTIVE
```

### Database update

Table:

```txt
billing_payment_intents
```

Updated values:

```txt
provider_payment_id = xendit.payment_session_id
provider_reference = xendit.reference_id
checkout_mode = "embedded"
provider_client_secret = xendit.components_sdk_key
checkout_url = null
expires_at = xendit.expires_at
updated_at = now()
```

Status remains:

```txt
status = "pending"
```

Reason:

```txt
The user has not paid yet.
```

---

## 4. Visuala renders embedded checkout

Visuala sends the user to an internal checkout page, for example:

```txt
/billing/checkout/<paymentIntentId>
```

The page loads the user's payment intent and mounts Xendit Components using:

```txt
billing_payment_intents.provider_client_secret
```

The user selects or enters the payment method inside Visuala. Sensitive payment fields are handled by Xendit Components, but the user does not leave the Visuala page.

### Database write

No trusted fulfillment write is performed from client-side component callbacks.

Important:

```txt
Client-side payment completion must not grant credits.
```

After the component reports completion, UI should show a verification state, for example:

```txt
Payment is being verified. Credits will be added automatically after confirmation.
```

---

## 5. Xendit sends webhook

For successful payment, Xendit sends:

```txt
payment_session.completed
```

For expired payment session, Xendit sends:

```txt
payment_session.expired
```

Payload includes values like:

```txt
event
data.payment_session_id
data.reference_id
data.status
data.amount
data.currency
data.payment_request_id
data.payment_id
```

Header includes:

```txt
x-callback-token
```

---

## 6. Visuala verifies webhook

Webhook route receives raw body and headers.

Validation:

```txt
headers["x-callback-token"] === XENDIT_WEBHOOK_TOKEN
```

If invalid:

- Do not mutate payment intent.
- Do not grant credits.
- Return a rejected response.

If valid:

- Normalize provider webhook into internal `VerifiedBillingWebhook`.
- Continue processing.

---

## 7. Visuala stores webhook event

After the callback token is valid, Visuala stores the webhook for idempotency and audit.

### Database insert

Table:

```txt
billing_webhook_events
```

Inserted values:

```txt
id = generated uuid
provider = "xendit"
event_id = derived unique id
event_type = "payment_session.completed"

payment_intent_id = null initially
provider_payment_id = data.payment_session_id
provider_reference = data.reference_id

payload = full webhook payload
signature_valid = true
processed_at = null
processing_error = null
created_at = now()
```

For Xendit Payment Session, if there is no explicit event ID, derive it from event type and session ID:

```txt
event_id = event + ":" + data.payment_session_id
```

Example:

```txt
payment_session.completed:ps-abc123
```

Idempotency constraint:

```txt
unique(provider, event_id)
```

If Xendit retries the same webhook, insert conflicts and Visuala can safely return success without double processing.

---

## 8. Visuala matches webhook to payment intent

Visuala finds the internal payment intent using:

```txt
provider = "xendit"
provider_reference = data.reference_id
```

Fallback:

```txt
provider = "xendit"
provider_payment_id = data.payment_session_id
```

### Database read

Table:

```txt
billing_payment_intents
```

Query shape:

```txt
where provider = "xendit"
and (
  provider_reference = webhook.provider_reference
  or provider_payment_id = webhook.provider_payment_id
)
```

### Database update

After matched, update:

```txt
billing_webhook_events.payment_intent_id = billing_payment_intents.id
```

Why `payment_intent_id` is nullable:

- Webhook can be valid but unmatched.
- Provider can send events out of order.
- Unknown events still need audit records.
- Future providers may have different identifiers.

---

## 9. If webhook status is paid

For:

```txt
payment_session.completed
```

Visuala validates:

```txt
payment_intent.status = "pending"
webhook.amount == payment_intent.amount
webhook.currency == payment_intent.currency
```

If payment intent is already:

```txt
status = "paid"
```

then processing is a no-op.

If valid and pending, Visuala runs atomic paid-to-credit fulfillment.

---

## 10. Atomic paid-to-credit fulfillment

This is the most important part of the flow.

The following operations must happen in one database transaction or RPC.

### 10.1 Lock payment intent

Table:

```txt
billing_payment_intents
```

Lock by ID.

Check:

```txt
status = "pending"
```

If already paid, return success without granting again.

### 10.2 Mark payment intent paid

Table:

```txt
billing_payment_intents
```

Update:

```txt
status = "paid"
paid_at = now()
updated_at = now()
```

### 10.3 Compute total credits

Use snapshot values from `billing_payment_intents`:

```txt
credits = 1000
bonus_credits = 200
total = 1200
credit_expires_in_days = 30
```

Compute:

```txt
expires_at = paid_at + 30 days
```

### 10.4 Upsert wallet

Table:

```txt
credit_wallets
```

Insert if missing:

```txt
user_id = payment_intents.user_id
available_balance = 0
reserved_balance = 0
created_at = now()
updated_at = now()
```

Then update:

```txt
available_balance = available_balance + totalCredits
updated_at = now()
```

Example before grant:

```txt
available_balance = 300
reserved_balance = 0
```

After grant of 1200:

```txt
available_balance = 1500
reserved_balance = 0
```

### 10.5 Create credit grant

Table:

```txt
credit_grants
```

Insert:

```txt
id = generated uuid
user_id = payment_intents.user_id
payment_intent_id = payment_intents.id
original_amount = 1200
remaining_amount = 1200
expires_at = paid_at + 30 days
created_at = now()
```

Uniqueness guard:

```txt
unique(payment_intent_id)
```

Purpose:

```txt
Prevents duplicate grants for the same payment intent.
```

### 10.6 Create ledger entry

Table:

```txt
credit_ledger_entries
```

Insert:

```txt
id = generated uuid
user_id = payment_intents.user_id
amount = +1200
entry_type = "purchase_grant"
source_type = "payment_intent"
source_id = payment_intents.id
payment_intent_id = payment_intents.id
pricing_plan_id = payment_intents.pricing_plan_id
balance_after = credit_wallets.available_balance after update
metadata = {
  "provider": "xendit",
  "provider_payment_id": "...",
  "credits": 1000,
  "bonus_credits": 200
}
created_at = now()
```

Recommended unique guard:

```txt
unique(payment_intent_id) where entry_type = "purchase_grant"
```

### 10.7 Mark webhook processed

Table:

```txt
billing_webhook_events
```

Update:

```txt
processed_at = now()
processing_error = null
```

---

## 11. If webhook status is expired

For:

```txt
payment_session.expired
```

### Database update

Table:

```txt
billing_payment_intents
```

If status is still pending:

```txt
status = "expired"
updated_at = now()
```

No credits are granted.

Table:

```txt
billing_webhook_events
```

Update:

```txt
payment_intent_id = matched payment intent id
processed_at = now()
processing_error = null
```

---

## 12. If webhook status is failed or unknown

For failed events:

### Database update

Table:

```txt
billing_payment_intents
```

Update:

```txt
status = "failed"
updated_at = now()
```

For unknown or ignored events:

- Do not mutate payment intent.
- Mark webhook as processed to avoid repeated internal handling.

Table:

```txt
billing_webhook_events
```

Successful ignored processing:

```txt
processed_at = now()
processing_error = null
```

Internal processing failure:

```txt
processing_error = "safe internal reason"
processed_at = null
```

---

## 13. User views balance

Dashboard/navbar/account UI calls a get balance use case.

### Database read

Table:

```txt
credit_wallets
```

Query:

```txt
where user_id = auth.uid()
```

Returned values:

```txt
available_balance
reserved_balance
```

Optional transaction history reads from:

```txt
credit_ledger_entries
```

Query:

```txt
where user_id = auth.uid()
order by created_at desc
```

---

## Successful Flow Example

User buys Pro Plan:

```txt
Rp100.000
1000 credits
200 bonus credits
30 day expiry
```

### `billing_payment_intents`

```txt
id = pi_1
user_id = user_1
pricing_plan_id = pro_plan
provider = xendit
provider_payment_id = ps_xendit_123
provider_reference = payment_intent_pi_1
status = paid
amount = 100000
currency = IDR
checkout_mode = embedded
provider_client_secret = <xendit_components_sdk_key>
checkout_url = null
credits = 1000
bonus_credits = 200
credit_expires_in_days = 30
paid_at = 2026-07-08T...
```

### `billing_webhook_events`

```txt
id = wh_1
provider = xendit
event_id = payment_session.completed:ps_xendit_123
event_type = payment_session.completed
payment_intent_id = pi_1
provider_payment_id = ps_xendit_123
provider_reference = payment_intent_pi_1
signature_valid = true
processed_at = 2026-07-08T...
```

### `credit_wallets`

```txt
user_id = user_1
available_balance = 1200
reserved_balance = 0
```

### `credit_grants`

```txt
id = grant_1
user_id = user_1
payment_intent_id = pi_1
original_amount = 1200
remaining_amount = 1200
expires_at = 2026-08-07T...
```

### `credit_ledger_entries`

```txt
id = ledger_1
user_id = user_1
amount = 1200
entry_type = purchase_grant
source_type = payment_intent
source_id = pi_1
payment_intent_id = pi_1
pricing_plan_id = pro_plan
balance_after = 1200
```

---

## Table Changes by Stage

### Create checkout

```txt
insert billing_payment_intents
```

### Xendit session created

```txt
update billing_payment_intents.provider_payment_id
update billing_payment_intents.checkout_mode
update billing_payment_intents.provider_client_secret
update billing_payment_intents.expires_at
```

### Webhook received

```txt
insert billing_webhook_events
```

### Webhook matched

```txt
update billing_webhook_events.payment_intent_id
```

### Payment completed

```txt
update billing_payment_intents.status = paid
upsert/update credit_wallets
insert credit_grants
insert credit_ledger_entries
update billing_webhook_events.processed_at
```

### Payment expired

```txt
update billing_payment_intents.status = expired
update billing_webhook_events.processed_at
```

---

## Key Notes

- `billing_webhook_events.payment_intent_id` is nullable by design.
- Valid but unmatched webhooks can still be audited.
- Credits are granted only once per `payment_intent_id`.
- Payment provider details stay in billing infrastructure adapters.
- Credit wallet and ledger remain provider-independent.
- Client-side payment completion is not trusted for fulfillment.
