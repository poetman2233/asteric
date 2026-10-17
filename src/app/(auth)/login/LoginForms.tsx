"use client";

import { useActionState } from "react";
import Link from "next/link";
import { demoLoginAction, loginAction, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/Form";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="stack" noValidate>
      {notice && !state.error ? <div className="alert alert-info" role="status">{notice}</div> : null}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <Field label="Work email" htmlFor="email">
        <input className="input" id="email" name="email" type="email" autoComplete="username" required defaultValue={state.fields?.email} autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="link" href="/forgot-password" style={{ fontSize: 13 }}>Forgot password?</Link>
      </div>
      <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function DemoForm({ needsCode }: { needsCode: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(demoLoginAction, {});
  return (
    <form action={action} className="stack-sm">
      <FormMessage state={state} />
      {needsCode ? (
        <Field label="Demo access code" htmlFor="code"><input className="input" id="code" name="code" autoComplete="off" required /></Field>
      ) : null}
      <SubmitButton className="btn btn-secondary btn-lg btn-block" pendingLabel="Opening demo…">Explore the demonstration workspace</SubmitButton>
      <p className="help">Read-only access to Keller &amp; Ross Employment Law, an illustrative organization. All data is synthetic.</p>
    </form>
  );
}
