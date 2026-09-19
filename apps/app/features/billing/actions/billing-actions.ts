"use server";

import { redirect } from "next/navigation";
import type { BillingPaymentStatus, CheckoutAction } from "@/domain/billing/types";
import { apiErrorMessage, apiFetch } from "@/lib/api/client";
import { createBillingCheckoutSchema, refreshBillingPaymentSchema, simulateBillingPaymentSchema } from "../schemas/billing-schema";

export type BillingRefreshProjection = { id: string; status: BillingPaymentStatus; actions: CheckoutAction[]; expiresAt: string | null; credited?: boolean };

export type BillingActionState = { error?: string; message?: string; payment?: BillingRefreshProjection };

export async function createBillingCheckoutAction(_: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const parsed = createBillingCheckoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid checkout request." };

  let paymentId: string;
  try {
    const { payment } = await apiFetch<{ payment: { id: string } }>("/billing/checkout", { method: "POST", body: parsed.data });
    paymentId = payment.id;
  } catch (error) {
    console.error("Failed to create billing checkout", error);
    return { error: apiErrorMessage(error, "Checkout is unavailable.", { unauthorized: "Sign in to continue." }) };
  }

  redirect(`/billing/checkout/${encodeURIComponent(paymentId)}`);
}

export async function simulateBillingPaymentAction(_: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const parsed = simulateBillingPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };

  try {
    const { message } = await apiFetch<{ message: string }>(`/billing/payments/${encodeURIComponent(parsed.data.paymentId)}/simulate`, { method: "POST" });

    return { message };
  } catch (error) {
    console.error("Failed to simulate billing payment", error);
    return { error: apiErrorMessage(error, "Simulation is unavailable for this payment.", { unauthorized: "Sign in to continue." }) };
  }
}

export async function refreshBillingPaymentAction(_: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const parsed = refreshBillingPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };

  try {
    const { payment } = await apiFetch<{ payment: BillingRefreshProjection }>(`/billing/payments/${encodeURIComponent(parsed.data.paymentId)}/refresh`);

    return { payment };
  } catch (error) {
    console.error("Failed to refresh billing payment", error);
    return { error: apiErrorMessage(error, "Could not refresh payment.", { unauthorized: "Sign in to continue." }) };
  }
}
