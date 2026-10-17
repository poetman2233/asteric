"use client";

import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/Form";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="stack">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" help="At least 12 characters.">
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={12} autoFocus />
      </Field>
      <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Saving…">Update password</SubmitButton>
    </form>
  );
}
