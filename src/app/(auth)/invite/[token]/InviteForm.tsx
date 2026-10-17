"use client";

import { useActionState } from "react";
import { acceptInviteAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/Form";

export function InviteForm({ token, needsAccount }: { token: string; needsAccount: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInviteAction, {});
  return (
    <form action={action} className="stack">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      {needsAccount ? (
        <>
          <Field label="Full name" htmlFor="name"><input className="input" id="name" name="name" autoComplete="name" required defaultValue={state.fields?.name} /></Field>
          <Field label="Title (optional)" htmlFor="title"><input className="input" id="title" name="title" placeholder="Partner" /></Field>
          <Field label="Choose a password" htmlFor="password" help="At least 12 characters."><input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={12} /></Field>
        </>
      ) : null}
      <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Joining…">Accept invitation</SubmitButton>
      <p className="help">By continuing you agree to the <a className="link" href="/terms">Terms of Service</a> and <a className="link" href="/privacy">Privacy Policy</a>.</p>
    </form>
  );
}
