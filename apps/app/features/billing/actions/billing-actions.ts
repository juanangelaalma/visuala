"use server";

import { redirect } from "next/navigation";
import { createBillingCheckout } from "@/application/billing/create-billing-checkout";
import { refreshOwnedBillingPayment } from "@/application/billing/refresh-owned-billing-payment";
import { createBillingServices } from "@/application/billing/services";
import { BillingError } from "@/domain/billing/errors";
import type { BillingRefreshProjection } from "@/application/billing/refresh-owned-billing-payment";
import { createBillingCheckoutSchema, refreshBillingPaymentSchema } from "../schemas/billing-schema";

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
    return { error: error instanceof BillingError ? "Could not create checkout." : "Checkout is unavailable." };
  }
  redirect(`/billing/checkout/${encodeURIComponent(paymentId)}`);
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
  } catch {
    return { error: "Could not refresh payment." };
  }
}
