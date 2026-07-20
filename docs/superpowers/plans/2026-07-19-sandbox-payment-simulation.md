# Sandbox Payment Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated owners start Xendit v3 QRIS/VA simulation only in sandbox; webhook settlement and manual refresh remain authoritative.

**Architecture:** Page derives display eligibility from server payment/config. Action accepts only payment UUID; use case reloads owned projection and enforces policy; domain gateway hides Xendit HTTP. Production fails closed at policy, resolver, and adapter.

**Tech Stack:** TypeScript, Next.js 16.2.9/React 19 Server Actions, Zod 4, Vitest 3, pnpm/Turbo.

## Global Constraints
- pnpm only; no dependency, DB migration, polling, retry, failure selector, impersonation, route handler, or commit steps.
- Preserve `features/routes → application → domain ← infrastructure`; credentials/HTTP stay infrastructure-only.
- Accepted simulation performs no local write or credit grant.
- Before Next edits run `NEXT_ROOT=$(dirname "$(pnpm --filter app exec node -p "require.resolve('next/package.json')")") && rg -l "useActionState|Server Action|use server" "$NEXT_ROOT/dist/docs"` and read matching installed docs. Root docs path is currently absent.
- Follow `docs/ai-coding-rules..md`, `DESIGN.md`, and test-first BUILD-OPERATE-CHECK.

## Objective
Add domain errors/contracts, eligibility policy, owned use case/factory, exact Xendit simulation, strict authenticated action/schema, server-derived tutorial/button/feedback, tests, lint/build/graph update.

## Assumptions
- Existing Xendit-created `providerPaymentId` is Payment Request v3 ID.
- `findOwnedProjection` returning null safely combines missing/other-owner.
- HTTP 2xx means accepted; body ignored. Network/timeout is ambiguous.
- Existing Vitest has no DOM renderer; test pure UI visibility seam and validate component via build.

## Files or Areas Likely Involved
`apps/app/domain/billing/{contracts,errors}.ts`; `application/billing/{payment-simulation-eligibility,simulate-owned-billing-payment,services,billing.test}.ts`; `infrastructure/billing/xendit-checkout-provider{,.test}.ts`; `features/billing/{schemas,actions,components}`; `app/billing/checkout/[paymentId]/page.tsx`.

---

### Task 1: Domain API [P0]
**Files:** Modify `apps/app/domain/billing/contracts.ts`, `errors.ts`; Test `application/billing/billing.test.ts`.
**Interfaces:** Consumes `BillingGateway`. Produces `SimulateBillingPaymentInput`, `simulatePayment`, four errors.

- [ ] **RED:** Add compile test:
```ts
const input: import("@/domain/billing/contracts").SimulateBillingPaymentInput = { providerPaymentId: "pr-1", amount: 10000 };
expect(input.amount).toBe(10000);
```
Run `pnpm --filter app test -- application/billing/billing.test.ts`; expect missing export FAIL.
- [ ] **GREEN:** Add:
```ts
export type SimulateBillingPaymentInput = { providerPaymentId: string; amount: number };
// inside BillingGateway
simulatePayment(input: SimulateBillingPaymentInput): Promise<void>;
```
```ts
export class BillingPaymentSimulationUnavailableError extends BillingError {}
export class BillingPaymentSimulationNotReadyError extends BillingError {}
export class BillingPaymentSimulationRejectedError extends BillingError {}
export class BillingPaymentSimulationUnknownError extends BillingError {}
```
Run same test; expect PASS. Update existing gateway doubles with `simulatePayment: vi.fn()`.

### Task 2: Eligibility and use case [P0]
**Files:** Create `application/billing/payment-simulation-eligibility.ts`, `simulate-owned-billing-payment.ts`; modify/test `billing.test.ts`.
**Interfaces:** Produces `canSimulateBillingPayment(payment, configuredEnvironment): boolean` and `simulateOwnedBillingPayment(deps,input): Promise<void>`.

- [ ] **RED:** Add separate tests for QRIS and VA success, production attempt, production config, other owner/null, paid status, missing ID, non-Xendit, non-positive/NaN amount. Assert success calls `simulatePayment({providerPaymentId:"pr-1",amount:10000})`; every rejection asserts no resolver/gateway call. Run focused test; expect missing modules FAIL.
- [ ] **GREEN:** Create policy:
```ts
import type { BillingEnvironment, BillingPaymentProjection } from "@/domain/billing/types";
export function canSimulateBillingPayment(p: BillingPaymentProjection, env: BillingEnvironment): boolean {
 const a=p.latestAttempt; return env==="test"&&Number.isFinite(p.priceAmount)&&p.priceAmount>0&&(p.status==="pending"||p.status==="requires_action")&&a!==null&&a.environment==="test"&&a.provider==="xendit"&&!!a.providerPaymentId;
}
```
Create use case:
```ts
export async function simulateOwnedBillingPayment(d:{payments:BillingPaymentRepository;gateways:BillingGatewayResolver;configuredEnvironment:BillingEnvironment},i:{paymentId:string;userId:string}){
 const p=await d.payments.findOwnedProjection(i.paymentId,i.userId);
 if(!p) throw new BillingPaymentSimulationUnavailableError();
 if(!p.latestAttempt?.providerPaymentId) throw new BillingPaymentSimulationNotReadyError();
 if(!canSimulateBillingPayment(p,d.configuredEnvironment)) throw new BillingPaymentSimulationUnavailableError();
 await d.gateways.resolve(p.latestAttempt.provider,p.latestAttempt.environment).simulatePayment({providerPaymentId:p.latestAttempt.providerPaymentId,amount:p.priceAmount});
}
```
Use exact imports from paths above. Run focused test; expect PASS. Review gate: ownership reload precedes all provider work.

### Task 3: Xendit adapter [P0]
**Files:** Modify/test `infrastructure/billing/xendit-checkout-provider.ts`.
**Interfaces:** Implements `simulatePayment`; rejected maps `BillingPaymentSimulationRejectedError`, fetch throw maps `BillingPaymentSimulationUnknownError`.

- [ ] **RED:** Test exact call:
```ts
expect(fetcher).toHaveBeenCalledWith("https://api.xendit.co/v3/payment_requests/pr%2F1/simulate",expect.objectContaining({method:"POST",body:'{"amount":10000}',headers:{Authorization:`Basic ${Buffer.from("xnd_development_test:").toString("base64")}`,"api-version":"2024-11-11","content-type":"application/json"}}));
```
Also test production/invalid amount/empty ID never fetch; 400 rejected; thrown fetch unknown and one call. Run adapter test; expect missing method FAIL.
- [ ] **GREEN:** Add method:
```ts
async simulatePayment(i:SimulateBillingPaymentInput):Promise<void>{
 if(this.config.environment!=="test"||!i.providerPaymentId||!Number.isFinite(i.amount)||i.amount<=0) throw new BillingPaymentSimulationUnavailableError();
 try { const r=await this.fetchImplementation(`${API_URL}/${encodeURIComponent(i.providerPaymentId)}/simulate`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${this.config.apiKey}:`).toString("base64")}`,"api-version":API_VERSION,"content-type":"application/json"},body:JSON.stringify({amount:i.amount}),signal:AbortSignal.timeout(this.config.requestTimeoutMs)}); if(!r.ok) throw new BillingPaymentSimulationRejectedError(); }
 catch(e){if(e instanceof BillingPaymentSimulationRejectedError)throw e;throw new BillingPaymentSimulationUnknownError();}
}
```
Add exact imports. Never parse body/retry. Run test; expect PASS.

### Task 4: Factory wiring [P0]
**Files:** Modify `application/billing/services.ts`.
**Interfaces:** Produces `services.simulation` matching use-case deps.
- [ ] Reuse `const gateways={resolve:resolveGateway}` in checkout and add:
```ts
simulation:{payments,gateways,configuredEnvironment:config.environment},
```
Run `pnpm --filter app exec tsc --noEmit`; expect PASS. Review: only factory imports infrastructure; resolver still rejects provider/environment mismatch.

### Task 5: Schema and action [P0]
**Files:** Modify/test `features/billing/schemas/billing-schema{,.test}.ts`, `actions/billing-actions{,.test}.ts`.
**Interfaces:** Produces strict `simulateBillingPaymentSchema` and `simulateBillingPaymentAction`.
- [ ] **RED schema:** Test UUID accepted; invalid UUID and extra `amount/providerPaymentId/environment/url` rejected. Run schema test; expect missing export FAIL.
- [ ] **GREEN schema:** Add:
```ts
export const simulateBillingPaymentSchema=z.object({paymentId:z.string().uuid("Invalid payment.")}).strict();
```
Run; expect PASS.
- [ ] **RED action:** Mock use case/services. Test invalid input, unauthenticated, exact call `simulateOwnedBillingPayment(services.simulation,{paymentId,userId})`, success copy, and each safe error copy. Run action test; expect missing action FAIL.
- [ ] **GREEN action:** Add module-level action:
```ts
export async function simulateBillingPaymentAction(_:BillingActionState,formData:FormData):Promise<BillingActionState>{
 const p=simulateBillingPaymentSchema.safeParse(Object.fromEntries(formData)); if(!p.success)return{error:p.error.issues[0]?.message??"Invalid payment."};
 try{const s=await createBillingServices();const u=await s.authProvider.getCurrentUser();if(!u)return{error:"Sign in to continue."};await simulateOwnedBillingPayment(s.simulation,{paymentId:p.data.paymentId,userId:u.id});return{message:"Simulation sent. Wait for the webhook, then refresh payment status."};}
 catch(e){console.error("Failed to simulate billing payment",e);if(e instanceof BillingPaymentSimulationNotReadyError)return{error:"Payment is not ready for simulation."};if(e instanceof BillingPaymentSimulationRejectedError)return{error:"Simulation could not be started."};if(e instanceof BillingPaymentSimulationUnknownError)return{error:"Simulation status is unknown. Refresh payment status before retrying."};return{error:"Simulation is unavailable for this payment."};}
}
```
Add exact imports. Run action/schema tests; expect PASS and suppress expected console errors in tests.

### Task 6: Server-derived UI [P1]
**Files:** Create `features/billing/components/payment-action-panel-view.ts`, `.test.ts`, `SandboxSimulationTutorial.tsx`; modify `PaymentActionPanel.tsx`, checkout page.
**Interfaces:** Page passes serializable `canSimulate:boolean`; panel uses independent simulation `useActionState`.
- [ ] **RED:** Test `getSandboxSimulationView(true)` equals `{showTutorial:true,showButton:true}` and false equivalent. Run test; expect missing module FAIL.
- [ ] **GREEN:** Add `export const getSandboxSimulationView=(canSimulate:boolean)=>({showTutorial:canSimulate,showButton:canSimulate});`. Run; expect PASS.
- [ ] Create tutorial:
```tsx
export function SandboxSimulationTutorial(){return <aside aria-labelledby="sandbox-title" className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><p id="sandbox-title" className="font-semibold text-primary">Sandbox payment tutorial</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-neutral-300"><li>No real charge occurs.</li><li>Click <strong>Simulate payment</strong>.</li><li>Xendit completes asynchronously through webhook.</li><li>Click <strong>Refresh payment status</strong> afterward.</li></ol></aside>}
```
- [ ] In page, after owned load set `const canSimulate=canSimulateBillingPayment(payment,services.config.environment)` and pass prop. No client derivation.
- [ ] In panel add prop, separate `useActionState(simulateBillingPaymentAction,{})`, tutorial, hidden `paymentId`, primary button text `Simulate payment`/`Sending simulation...`, disabled pending, `role="status" aria-live="polite"` success, `role="alert"` error. Keep refresh state/form separate and unchanged; never feed simulation state into effective payment status.
- [ ] Run focused UI/action tests then `pnpm app:build`; expect PASS. Review keyboard focus, live announcements, tutorial absent when false, dark/lime rounded DESIGN.md styling.

### Task 7: Final review and validation [P0]
**Interfaces:** Produces verified feature and current graph.
- [ ] Run `pnpm --filter app test`; expect all PASS, including existing webhook fulfillment tests.
- [ ] Run `pnpm app:lint`; expect zero errors.
- [ ] Run `pnpm app:build`; expect PASS.
- [ ] Security review: browser sends paymentId only; gateway data comes from owned reload; test config+attempt, Xendit, actionable status, ID, finite positive snapshot required; no local write; no raw error/body.
- [ ] Run `graphify update .`; expect successful graph refresh. Dirty graph output is expected.
- [ ] Report Summary, Files changed, Validation, Rule compliance, Risks/follow-up. Do not claim sandbox certification without real request/webhook evidence.

## Validation Commands
```bash
pnpm --filter app test
pnpm app:lint
pnpm app:build
graphify update .
```

## Risks and Human Decisions Needed
- **Rollout confirmation required:** verify no legacy Xendit IDs coexist; current schema lacks explicit v3 resource discriminator. If they do, require separate approved DB migration rather than guessing ID shape.
- Human sandbox certification: run one QRIS and one VA simulation, observe webhook settlement, manually refresh.
- Pure UI seam covers visibility because no DOM harness exists; add Playwright only when stable authenticated sandbox fixtures exist.

## Self-Review Findings
- Coverage: every spec eligibility gate, exact HTTP contract, QRIS/VA, ownership, safe errors, tutorial/pending/success/manual refresh, webhook-only settlement, validation mapped above.
- Placeholder scan: no TBD/TODO/ellipsis or unspecified implementation step.
- Type consistency: `SimulateBillingPaymentInput`, `simulatePayment`, `configuredEnvironment`, action/schema, and `canSimulate` remain exact across tasks.
- Architecture: application contract-only; infrastructure HTTP-only; action authenticated; server eligibility display-only and rechecked by use case.
