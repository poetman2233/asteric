"use client";

import { useActionState } from "react";
import { logoutAction, mfaAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/Form";

export function MfaForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(mfaAction, {});
  return (
    <div className="stack">
      <form action={action} className="stack">
        <FormMessage state={state} />
        <input type="hidden" name="next" value={next} />
        <Field label="Authentication code" htmlFor="code">
          <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={12} />
        </Field>
        <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Verifying…">Verify</SubmitButton>
      </form>
      <form action={logoutAction}><button className="btn btn-ghost btn-block" type="submit">Cancel and sign out</button></form>
    </div>
  );
}
