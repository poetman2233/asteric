"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/Form";

export function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  return (
    <form action={action} className="stack">
      <FormMessage state={state} />
      {!state.ok ? (
        <>
          <Field label="Work email" htmlFor="email"><input className="input" id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} autoFocus /></Field>
          <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Sending…">Send reset link</SubmitButton>
        </>
      ) : null}
      <Link className="link" href="/login" style={{ fontSize: 13 }}>Back to sign in</Link>
    </form>
  );
}
