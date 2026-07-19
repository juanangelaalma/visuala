# Sandbox Payment Simulation Design

## Goal

Let payment owners complete QRIS and virtual-account checkout testing from Visuala when Xendit runs in sandbox, without exposing Xendit credentials or enabling simulation in production.

## Scope

- Add one **Simulate payment** button to actionable sandbox payment detail views.
- Support Xendit Payment Request API v3 QRIS and virtual-account attempts through the same simulation endpoint.
- Keep existing webhook fulfillment and manual **Refresh status** flow.
- Do not add automatic polling, selectable failure scenarios, production simulation, admin impersonation, or browser access to Xendit credentials.

## Architecture

UI calls an authenticated Server Action because simulation is a user-triggered mutation. Action validates input and delegates to an application use case. Use case verifies ownership and eligibility through domain repositories, then calls a domain billing-gateway contract. Xendit infrastructure implements that contract and performs the external request.

Dependency direction remains:

```txt
PaymentActionPanel
  → billing Server Action
    → simulate owned billing payment use case
      → billing domain contracts
        ← Xendit checkout provider
```

No Xendit request code or API key enters page, component, action, or application layers.

## Eligibility and Security

Server-side simulation requires all conditions:

- Authenticated user owns billing payment.
- Latest provider attempt exists.
- Attempt environment is `test`.
- Provider is Xendit.
- `providerPaymentId` exists and identifies a Payment Request v3 resource.
- Payment status remains actionable: `pending` or `requires_action`.
- Snapshotted payment amount is valid.
- Billing configuration resolves to sandbox/test.

Production must fail closed even if client markup or submitted form data is manipulated. Xendit test secret key stays in `XENDIT_API_KEY` and is read only by server-side infrastructure. Server Action accepts only internal billing payment UUID; client cannot submit provider ID, amount, environment, or target URL.

## Xendit Simulation

Infrastructure sends:

```http
POST https://api.xendit.co/v3/payment_requests/{providerPaymentId}/simulate
Authorization: Basic <test-secret-key:>
Content-Type: application/json
api-version: 2024-11-11

{"amount": <payment snapshot amount>}
```

QRIS and Payment Request v3 virtual accounts use this same endpoint. Immediate Xendit simulation status is `PENDING`; final payment result arrives asynchronously through existing Xendit webhook processing.

Official references:

- https://docs.xendit.co/apidocs/simulate-payment-test-mode.md
- https://docs.xendit.co/apidocs/create-payment-request.md
- https://docs.xendit.co/docs/payments-api-webhooks.md
- https://docs.xendit.co/docs/handling-webhooks.md

## UI Behavior

Payment detail page exposes sandbox eligibility to `PaymentActionPanel` through server-derived data. Eligible actionable payments show a compact sandbox tutorial panel near payment actions:

1. Explain that no real charge occurs.
2. Tell user to click **Simulate payment**.
3. Explain that Xendit completes asynchronously through webhook.
4. Tell user to click existing **Refresh status** afterward.

During submission, button becomes disabled and shows pending feedback. On accepted simulation, UI displays: `Simulation sent. Wait for the webhook, then refresh payment status.` It does not mark payment paid locally. Existing status banner remains source of truth after manual refresh.

Tutorial and button remain absent in production and for final or expired payments.

## Error Handling

Application defines user-recoverable simulation failures by caller needs:

- Not eligible or production: simulation unavailable.
- Missing provider payment ID: payment not ready for simulation.
- Provider rejects request: simulation could not be started.
- Ambiguous timeout/network outcome: simulation status unknown; user should refresh before retrying.

Infrastructure wraps Xendit response details and never returns raw response bodies, credentials, stack traces, or internal identifiers to UI. Server Action returns a small user-safe state. Existing payment state remains unchanged when simulation submission fails.

## Data Flow

1. Server renders owned payment and latest attempt.
2. Server derives `canSimulate` from payment/attempt/config state.
3. Owner clicks **Simulate payment**.
4. Server Action authenticates user and validates payment UUID.
5. Use case reloads owned payment and latest attempt; client-derived eligibility is ignored.
6. Xendit adapter submits provider payment ID and snapshotted amount.
7. Action returns accepted or user-safe error state.
8. Xendit sends payment webhook asynchronously.
9. Existing webhook flow updates payment and grants credits idempotently.
10. User clicks **Refresh status** to reread Supabase and see final state.

## Testing

Unit and integration tests cover:

- Owned test QRIS payment invokes gateway with provider payment ID and snapshot amount.
- Owned test virtual-account payment follows same simulation flow.
- Production attempt is rejected without gateway call.
- Payment owned by another user is rejected.
- Final payment status is rejected.
- Missing provider payment ID is rejected.
- Provider accepted response maps to successful action state.
- Provider rejection and ambiguous outcomes map to user-safe states.
- Xendit adapter sends exact method, URL, API version, Basic auth, and amount body.
- UI renders tutorial/button only when server-derived `canSimulate` is true.
- Existing webhook fulfillment remains unchanged and is still required before credits are granted.

Validation commands:

```bash
pnpm --filter app test
pnpm app:lint
pnpm app:build
graphify update .
```

## Acceptance Criteria

- Sandbox QRIS and virtual-account owners can start Xendit simulation from payment detail UI.
- Browser receives no Xendit secret key and cannot choose provider ID, amount, environment, or URL.
- Production and ineligible payments cannot invoke Xendit simulation server-side.
- Accepted simulation does not directly change payment status or grant credits.
- Webhook remains sole settlement path; manual refresh displays resulting status.
- Errors shown to user contain no raw Xendit details.
