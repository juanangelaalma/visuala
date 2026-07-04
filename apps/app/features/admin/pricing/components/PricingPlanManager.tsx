"use client";

import { Button } from "@visuala/ui";
import { useActionState, useState } from "react";
import type { PricingPlan } from "@/domain/pricing/types";
import { deletePricingPlanAction, savePricingPlanAction, type PricingPlanActionState } from "../actions/pricing-plan-actions";

type PricingPlanManagerProps = {
  plans: PricingPlan[];
};

const initialState: PricingPlanActionState = {};

export function PricingPlanManager({ plans }: PricingPlanManagerProps) {
  return (
    <section className="space-y-6 text-white">
      <header className="rounded-3xl border border-white/10 bg-pricing-bg p-6 shadow-card-inner">
        <p className="text-sm font-semibold text-primary">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Pricing Management</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-450">Manage credit packages, pricing, expiry, and visibility.</p>
      </header>

      <PricingPlanForm title="Create new plan" />

      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <PricingPlanForm key={plan.id} title={`Edit ${plan.name}`} plan={plan} />
        ))}
      </div>
    </section>
  );
}

type PricingPlanFormProps = {
  title: string;
  plan?: PricingPlan;
};

function PricingPlanForm({ title, plan }: PricingPlanFormProps) {
  const [state, formAction, pending] = useActionState(savePricingPlanAction, initialState);
  const [expiryDays, setExpiryDays] = useState(plan?.creditExpiresInDays ?? 30);

  return (
    <form action={formAction} className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-card-inner">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>
          {plan ? <p className="mt-1 text-xs text-neutral-500">{plan.id}</p> : null}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${plan?.isActive ?? true ? "bg-primary text-black" : "bg-white/10 text-neutral-450"}`}>{plan?.isActive ?? true ? "Active" : "Inactive"}</span>
      </div>

      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <input type="hidden" name="isActive" value="false" />
      <input type="hidden" name="isMostPopular" value="false" />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Slug" name="slug" defaultValue={plan?.slug} placeholder="starter" />
        <Field label="Name" name="name" defaultValue={plan?.name} placeholder="Starter" />
        <Field label="Price amount" name="priceAmount" type="number" defaultValue={plan?.priceAmount ?? 0} />
        <Field label="Currency" name="currency" defaultValue={plan?.currency ?? "IDR"} />
        <SelectField label="Billing period" name="billingPeriod" defaultValue={plan?.billingPeriod ?? "monthly"} onChange={(value) => setExpiryDays(value === "annually" ? 365 : 30)} />
        <Field label="Billing label" name="billingLabel" defaultValue={plan?.billingLabel ?? "/month"} placeholder="/month" />
        <Field label="Compare at amount" name="compareAtAmount" type="number" defaultValue={plan?.compareAtAmount ?? ""} />
        <Field label="Badge label" name="badgeLabel" defaultValue={plan?.badgeLabel ?? ""} placeholder="Save 20%" />
        <Field label="CTA label" name="ctaLabel" defaultValue={plan?.ctaLabel ?? "Start now"} placeholder="Start now" />
        <Field label="Credits" name="credits" type="number" defaultValue={plan?.credits ?? 100} />
        <Field label="Bonus credits" name="bonusCredits" type="number" defaultValue={plan?.bonusCredits ?? 0} />
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-neutral-450">Expires in days</span>
          <input name="creditExpiresInDays" type="number" value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value))} className="h-11 w-full rounded-2xl border border-white/10 bg-black px-4 text-white outline-none transition placeholder:text-neutral-650 focus:border-primary" />
        </label>
        <Field label="Sort order" name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 100} />
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-neutral-450">Features</span>
        <textarea name="features" defaultValue={plan?.features.join("\n") ?? ""} rows={4} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none transition placeholder:text-neutral-650 focus:border-primary" placeholder="One feature per line" />
      </label>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-neutral-450">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" value="true" defaultChecked={plan?.isActive ?? true} className="accent-primary" />
          Active
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isMostPopular" value="true" defaultChecked={plan?.isMostPopular ?? false} className="accent-primary" />
          Most popular
        </label>
      </div>

      {state.error ? <p className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">{state.error}</p> : null}
      {state.message ? <p className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">{state.message}</p> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} className="h-11 px-6 py-0 text-sm disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving..." : "Save plan"}
        </Button>
        {plan ? (
          <Button type="submit" variant="danger" formAction={deletePricingPlanAction} onClick={(event) => (window.confirm(`Delete ${plan.name}?`) ? undefined : event.preventDefault())} className="h-11 px-6 py-0 text-sm">
            Delete plan
          </Button>
        ) : null}
      </div>
    </form>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  defaultValue: string;
  onChange?: (value: string) => void;
};

function SelectField({ label, name, defaultValue, onChange }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-neutral-450">{label}</span>
      <select name={name} defaultValue={defaultValue} onChange={(event) => onChange?.(event.target.value)} className="h-11 w-full rounded-2xl border border-white/10 bg-black px-4 text-white outline-none transition focus:border-primary">
        <option value="monthly">Monthly</option>
        <option value="annually">Annually</option>
      </select>
    </label>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
};

function Field({ label, name, type = "text", defaultValue, placeholder }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-neutral-450">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="h-11 w-full rounded-2xl border border-white/10 bg-black px-4 text-white outline-none transition placeholder:text-neutral-650 focus:border-primary" />
    </label>
  );
}
