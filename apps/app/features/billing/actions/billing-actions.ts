"use server";

import { redirect } from "next/navigation";
import { createBillingCheckout } from "@/application/billing/create-billing-checkout";
import { listOwnedBillingPayments } from "@/application/billing/list-owned-billing-payments";
import { refreshOwnedBillingPayment } from "@/application/billing/refresh-owned-billing-payment";
import { createBillingServices } from "@/application/billing/services";
import { simulateOwnedBillingPayment } from "@/application/billing/simulate-owned-billing-payment";
import { BillingError, BillingPaymentSimulationNotReadyError, BillingPaymentSimulationRejectedError, BillingPaymentSimulationUnknownError } from "@/domain/billing/errors";
import type { BillingPaymentProjection } from "@/domain/billing/types";
import type { BillingRefreshProjection } from "@/application/billing/refresh-owned-billing-payment";
import { createBillingCheckoutSchema, listBillingPaymentsSchema, refreshBillingPaymentSchema, simulateBillingPaymentSchema } from "../schemas/billing-schema";

export type BillingActionState = { error?: string; message?: string; payment?: BillingRefreshProjection };

export async function createBillingCheckoutAction(_: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const parsed = createBillingCheckoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid checkout request." };
  let paymentId: string;
  try {
    const services = await createBillingServices();
    if (!services.config.checkoutEnabled || (!services.config.qrisEnabled && !services.config.virtualAccountEnabled)) return { error: "Checkout is unavailable." };
    const user = await services.authProvider.getCurrentUser();
    if (!user) return { error: "Sign in to continue." };
    const payment = await createBillingCheckout(services.checkout, { ...parsed.data, userId: user.id });
    if (!payment) return { error: "Could not create checkout." };
    paymentId = payment.id;
  } catch (error) {
    console.error("Failed to create billing checkout", error);
    return { error: error instanceof BillingError ? "Could not create checkout." : "Checkout is unavailable." };
  }
  redirect(`/billing/checkout/${encodeURIComponent(paymentId)}`);
}

export async function simulateBillingPaymentAction(_: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const parsed = simulateBillingPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  try {
    const services = await createBillingServices();
    const user = await services.authProvider.getCurrentUser();
    if (!user) return { error: "Sign in to continue." };
    await simulateOwnedBillingPayment(services.simulation, { paymentId: parsed.data.paymentId, userId: user.id });
    return { message: "Simulation sent. Wait for the webhook, then refresh payment status." };
  } catch (error) {
    console.error("Failed to simulate billing payment", error);
    if (error instanceof BillingPaymentSimulationNotReadyError) return { error: "Payment is not ready for simulation." };
    if (error instanceof BillingPaymentSimulationRejectedError) return { error: "Simulation could not be started." };
    if (error instanceof BillingPaymentSimulationUnknownError) return { error: "Simulation status is unknown. Refresh payment status before retrying." };
    return { error: "Simulation is unavailable for this payment." };
  }
}

export async function refreshBillingPaymentAction(_: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const parsed = refreshBillingPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  try {
    const services = await createBillingServices();
    const user = await services.authProvider.getCurrentUser();
    if (!user) return { error: "Sign in to continue." };
    const payment = await refreshOwnedBillingPayment({ payments: services.payments }, { paymentId: parsed.data.paymentId, userId: user.id });
    return { payment };
  } catch (error) {
    console.error("Failed to refresh billing payment", error);
    return { error: "Could not refresh payment." };
  }
}

export type BillingHistoryActionState = { error?: string; payments?: BillingPaymentProjection[]; total?: number; page?: number; pageSize?: number };

export async function listBillingPaymentsAction(_: BillingHistoryActionState, formData: FormData): Promise<BillingHistoryActionState> {
  const parsed = listBillingPaymentsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  try {
    const services = await createBillingServices();
    const user = await services.authProvider.getCurrentUser();
    if (!user) return { error: "Sign in to continue." };
    const result = await listOwnedBillingPayments(services.payments, { userId: user.id, page: parsed.data.page, pageSize: parsed.data.pageSize });
    return { payments: result.payments, total: result.total, page: parsed.data.page, pageSize: parsed.data.pageSize };
  } catch (error) {
    console.error("Failed to list billing payments", error);
    return { error: "Could not load payment history." };
  }
}
