"use client";

import { Button } from "@visuala/ui";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { BillingPaymentStatus, CheckoutAction } from "@/domain/billing/types";
import { refreshBillingPaymentAction, simulateBillingPaymentAction, type BillingActionState } from "../actions/billing-actions";
import { PaymentExpiry } from "./PaymentExpiry";
import { PaymentStatusBanner } from "./PaymentStatusBanner";
import { QrisPaymentAction } from "./QrisPaymentAction";
import { SandboxSimulationControls } from "./SandboxSimulationControls";

type PaymentActionPanelProps = {
  paymentId: string;
  status: BillingPaymentStatus;
  actions: CheckoutAction[];
  expiresAt: string | null;
  canSimulate: boolean;
};

const initialState: BillingActionState = {};
const terminalStatuses: BillingPaymentStatus[] = ["paid", "failed", "expired", "cancelled"];
const order: Record<CheckoutAction["type"], number> = { deep_link: 0, redirect: 1, qr_code: 2, virtual_account: 3 };

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isActive(expiresAt: string | null) {
  return !expiresAt || Date.parse(expiresAt) > Date.now();
}

export function PaymentActionPanel({ paymentId, status, actions, expiresAt, canSimulate }: PaymentActionPanelProps) {
  const [state, formAction, pending] = useActionState(refreshBillingPaymentAction, initialState);
  const [simulationState, simulationFormAction, simulationPending] = useActionState(simulateBillingPaymentAction, initialState);
  const [clock, setClock] = useState(0);
  const refreshedPayment = state.payment?.id === paymentId ? state.payment : null;
  const effectiveStatus = refreshedPayment?.status ?? status;
  const effectiveActions = refreshedPayment?.actions ?? actions;
  const effectiveExpiresAt = refreshedPayment?.expiresAt ?? expiresAt;
  const terminal = terminalStatuses.includes(effectiveStatus);
  const sortedActions = useMemo(() => [...effectiveActions].sort((a, b) => order[a.type] - order[b.type]), [effectiveActions]);
  const activeActions = sortedActions.filter((action) => isActive(action.expiresAt));
  const hasExpiredActions = activeActions.length < sortedActions.length;

  useEffect(() => {
    const timer = window.setInterval(() => setClock((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section aria-label="Payment actions" className="space-y-5 rounded-3xl border border-white/10 bg-surface p-5 shadow-card-inner sm:p-6">
      <PaymentStatusBanner status={effectiveStatus} />
      {!terminal && activeActions.length ? activeActions.map((action, index) => {
        if (action.type === "qr_code") return <QrisPaymentAction key={`${action.type}-${index}`} value={action.value} expiresAt={action.expiresAt} />;
        if (action.type === "virtual_account") return <div key={`${action.type}-${index}`} className="rounded-2xl border border-white/10 bg-black p-4"><p className="text-xs font-medium uppercase tracking-wider text-neutral-450">{action.bankCode} virtual account</p><p className="mt-2 break-all text-lg font-semibold text-white">{action.accountNumber}</p></div>;
        const href = safeHttpUrl(action.url);
        return href ? <Button key={`${action.type}-${index}`} href={href} target="_blank" rel="noopener noreferrer" className="min-h-11 w-full px-5 py-2 text-sm">Open payment app</Button> : <p key={`${action.type}-${index}`} role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">Payment link is unavailable.</p>;
      }) : null}
      {!terminal && !activeActions.length ? <p className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm text-neutral-450">{hasExpiredActions ? "Payment instructions expired. Refresh the status before continuing." : "Payment instructions are not available yet. Refresh the status shortly."}</p> : null}
      {!terminal && effectiveExpiresAt ? <PaymentExpiry key={`${effectiveExpiresAt}-${clock > 0}`} expiresAt={effectiveExpiresAt} /> : null}
      <SandboxSimulationControls paymentId={paymentId} canSimulate={canSimulate} pending={simulationPending} state={simulationState} action={simulationFormAction} />
      {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      <form action={formAction}>
        <input type="hidden" name="paymentId" value={paymentId} />
        <Button type="submit" variant={terminal ? "primary" : "outline"} disabled={pending} className="min-h-11 w-full px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Refreshing..." : terminal ? "Check latest status" : "Refresh payment status"}</Button>
      </form>
      {terminal && effectiveStatus !== "paid" ? <Button href="/billing/plans" variant="outline" className="min-h-11 w-full border-white/20 px-5 py-2 text-sm">Choose another plan</Button> : null}
    </section>
  );
}
