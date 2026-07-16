"use client";

import { Button } from "@visuala/ui";
import { useActionState, useState } from "react";
import { createBillingCheckoutAction, type BillingActionState } from "../actions/billing-actions";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import type { BillingPaymentMethodOption } from "./types";

type BillingCheckoutFormProps = {
  pricingPlanId: string;
  idempotencyKey: string;
  methods: BillingPaymentMethodOption[];
  defaultPaymentMethodId?: string;
  checkoutAvailable?: boolean;
  unavailableMessage?: string;
};

const initialState: BillingActionState = {};

export function BillingCheckoutForm({ pricingPlanId, idempotencyKey, methods, defaultPaymentMethodId, checkoutAvailable = true, unavailableMessage }: BillingCheckoutFormProps) {
  const selectableMethods = methods.filter((method) => method.enabled && method.launchPhase === 1 && (method.kind === "qris" || method.kind === "virtual_account"));
  const initialPaymentMethodId = selectableMethods.some((method) => method.id === defaultPaymentMethodId) ? defaultPaymentMethodId : selectableMethods[0]?.id;
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(initialPaymentMethodId ?? "");
  const [state, formAction, pending] = useActionState(createBillingCheckoutAction, initialState);
  const hasMethods = selectableMethods.length > 0;
  const formDisabled = pending || !checkoutAvailable;
  const submitDisabled = formDisabled || !selectedPaymentMethodId;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="pricingPlanId" value={pricingPlanId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <PaymentMethodSelector methods={methods} value={selectedPaymentMethodId} onChange={setSelectedPaymentMethodId} disabled={formDisabled} />
      {unavailableMessage ? <p role="status" className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm leading-6 text-neutral-300">{unavailableMessage}</p> : null}
      {state.error ? <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">{state.error}</p> : null}
      {state.message ? <p role="status" className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-white">{state.message}</p> : null}
      <Button type="submit" disabled={submitDisabled} aria-disabled={submitDisabled} className="h-12 w-full px-5 py-0 text-sm font-bold uppercase tracking-wide shadow-pricing-cta disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-50">
        {pending ? "Creating checkout..." : hasMethods && checkoutAvailable ? "Continue to payment" : "Payment unavailable"}
      </Button>
    </form>
  );
}
