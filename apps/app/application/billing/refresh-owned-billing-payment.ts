import type { BillingPaymentRepository } from "@/domain/billing/contracts";
import { BillingPaymentNotFoundError } from "@/domain/billing/errors";
import type { BillingPaymentProjection, BillingPaymentStatus, CheckoutAction } from "@/domain/billing/types";

export type BillingRefreshProjection = { id: string; status: BillingPaymentStatus; actions: CheckoutAction[]; expiresAt: string | null; credited?: boolean };

function safeActions(actions: CheckoutAction[]): CheckoutAction[] {
  const safe: CheckoutAction[] = [];
  for (const action of actions) {
    if (action.type === "qr_code" && typeof action.value === "string") safe.push({ type: action.type, value: action.value, expiresAt: action.expiresAt ?? null });
    if ((action.type === "redirect" || action.type === "deep_link") && typeof action.url === "string") safe.push({ type: action.type, url: action.url, expiresAt: action.expiresAt ?? null });
    if (action.type === "virtual_account" && typeof action.accountNumber === "string" && typeof action.bankCode === "string") safe.push({ type: action.type, accountNumber: action.accountNumber, bankCode: action.bankCode, expiresAt: action.expiresAt ?? null });
  }
  return safe;
}

export function toBillingRefreshProjection(payment: BillingPaymentProjection): BillingRefreshProjection {
  return { id: payment.id, status: payment.status, actions: safeActions(payment.latestAttempt?.actions ?? []), expiresAt: payment.latestAttempt?.expiresAt ?? payment.expiresAt };
}

export async function refreshOwnedBillingPayment(dependencies: { payments: BillingPaymentRepository }, input: { paymentId: string; userId: string }) {
  const payment = await dependencies.payments.findOwnedProjection(input.paymentId, input.userId);
  if (!payment) throw new BillingPaymentNotFoundError("Billing payment not found");
  return toBillingRefreshProjection(payment);
}
