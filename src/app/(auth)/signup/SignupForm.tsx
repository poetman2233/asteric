"use client";

import { useActionState } from "react";
import { signupAction, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/Form";

export function SignupForm({ setup, askFirm }: { setup: string; askFirm: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(signupAction, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="stack">
      <FormMessage state={state} />
      <input type="hidden" name="setup" value={setup} />
      <Field label="Full name" htmlFor="name"><input className="input" id="name" name="name" autoComplete="name" required defaultValue={state.fields?.name} /></Field>
      <Field label="Work email" htmlFor="email"><input className="input" id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} /></Field>
      {askFirm ? <Field label="Firm name" htmlFor="firm"><input className="input" id="firm" name="firm" autoComplete="organization" required defaultValue={state.fields?.firm} /></Field> : null}
      <Field label="Password" htmlFor="password" help="At least 12 characters. A passphrase works well.">
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Creating account…">Create account</SubmitButton>
      <p className="help">By creating an account you agree to the <a className="link" href="/terms">Terms of Service</a> and <a className="link" href="/privacy">Privacy Policy</a>.</p>
    </form>
  );
}
