"use client";

import { Button } from "@visuala/ui";
import { useActionState, useEffect, useState } from "react";
import type { AuthActionState } from "@/features/auth/actions/auth-actions";

const cooldownSeconds = process.env.NODE_ENV === "development" ? 1 : 60;
const initialState: AuthActionState = {};

type ResendConfirmationFormProps = {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  email?: string;
};

export function ResendConfirmationForm({ action, email }: ResendConfirmationFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const disabled = pending || remainingSeconds > 0 || !email;

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timeout = window.setTimeout(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);

    return () => window.clearTimeout(timeout);
  }, [remainingSeconds]);

  if (!email) return null;

  return (
    <form action={formAction} className="mt-5 space-y-3" onSubmit={() => setRemainingSeconds(cooldownSeconds)}>
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" disabled={disabled} className="h-12 w-full px-0 py-0 text-sm disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Sending..." : remainingSeconds > 0 ? `Resend in ${remainingSeconds}s` : "Resend confirmation email"}
      </Button>
      {state.message ? <p className="text-center text-sm leading-6 text-neutral-450">{state.message}</p> : null}
      {state.error ? <p className="text-center text-sm leading-6 text-danger">{state.error}</p> : null}
    </form>
  );
}
