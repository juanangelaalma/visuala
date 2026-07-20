import type { BillingActionState } from "../actions/billing-actions";
import { SandboxSimulationTutorial } from "./SandboxSimulationTutorial";

type SandboxSimulationControlsProps = {
  paymentId: string;
  canSimulate: boolean;
  pending: boolean;
  state: BillingActionState;
  action: (payload: FormData) => void;
};

export function SandboxSimulationControls({ paymentId, canSimulate, pending, state, action }: SandboxSimulationControlsProps) {
  if (!canSimulate) return null;
  return <>
    <SandboxSimulationTutorial />
    <form action={action} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-full bg-primary px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Sending simulation..." : "Simulate payment"}</button>
      {state.message ? <p role="status" aria-live="polite" className="text-sm text-primary">{state.message}</p> : null}
      {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
    </form>
  </>;
}
