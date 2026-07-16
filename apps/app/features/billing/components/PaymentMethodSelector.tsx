import type { BillingPaymentMethodOption } from "./types";

type PaymentMethodSelectorProps = {
  methods: BillingPaymentMethodOption[];
  name?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function PaymentMethodSelector({ methods, name = "paymentMethodCatalogId", value, onChange, disabled = false }: PaymentMethodSelectorProps) {
  const hasSelectableMethod = methods.some((method) => method.enabled && method.launchPhase === 1 && (method.kind === "qris" || method.kind === "virtual_account"));

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-base font-semibold text-white">Payment method</legend>
      <p className="text-sm text-neutral-450">Choose how you want to pay.</p>
      {methods.length ? (
        <div className="grid gap-3">
          {methods.map((method) => {
            const selectable = method.enabled && method.launchPhase === 1 && (method.kind === "qris" || method.kind === "virtual_account");
            return (
              <label key={method.id} className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 transition motion-reduce:transition-none ${selectable ? "cursor-pointer border-white/10 bg-black has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-black" : "cursor-not-allowed border-white/5 bg-black/50 opacity-60"}`}>
                <input type="radio" name={selectable ? name : undefined} value={selectable ? method.id : undefined} checked={selectable && method.id === value} onChange={() => onChange(method.id)} required={selectable} disabled={!selectable} className="h-5 w-5 shrink-0 accent-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{method.label}</span>
                  {method.description ? <span className="mt-1 block text-xs leading-5 text-neutral-450">{method.description}</span> : null}
                </span>
                {!selectable ? <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">Coming soon</span> : null}
              </label>
            );
          })}
        </div>
      ) : (
        <p role="status" className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm text-neutral-450">No payment methods are currently available.</p>
      )}
      {!hasSelectableMethod && methods.length ? <p role="status" className="text-sm text-neutral-450">Checkout is not available for these payment methods yet.</p> : null}
    </fieldset>
  );
}
