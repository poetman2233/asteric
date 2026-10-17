"use client";

import { useActionState } from "react";
import { requestAccessAction, type FormState } from "@/app/(auth)/actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/Form";

export function RequestForm({ kind }: { kind: "access" | "contact" }) {
  const [state, action] = useActionState<FormState, FormData>(requestAccessAction, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="stack" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="kind" value={kind} />
      {/* Honeypot: invisible to people, filled by bots. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
        <label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid-2">
        <Field label="Name" htmlFor="name"><input className="input" id="name" name="name" autoComplete="name" required defaultValue={state.fields?.name} /></Field>
        <Field label="Work email" htmlFor="email"><input className="input" id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Firm or organization" htmlFor="firm"><input className="input" id="firm" name="firm" autoComplete="organization" required defaultValue={state.fields?.firm} /></Field>
        <Field label="Your role" htmlFor="role"><input className="input" id="role" name="role" placeholder="Managing partner" /></Field>
      </div>
      {kind === "access" ? (
        <Field label="Approximate number of attorneys" htmlFor="firmSize">
          <select className="select" id="firmSize" name="firmSize" defaultValue="">
            <option value="">Select</option><option>1–5</option><option>6–15</option><option>16–40</option><option>41–100</option><option>100+</option>
          </select>
        </Field>
      ) : null}
      <Field label={kind === "access" ? "What would you like to understand about your firm? (optional)" : "Message"} htmlFor="message">
        <textarea className="textarea" id="message" name="message" rows={4} maxLength={2000} defaultValue={state.fields?.message} required={kind === "contact"} />
      </Field>
      <SubmitButton className="btn btn-primary btn-lg" pendingLabel="Sending…">{kind === "access" ? "Request access" : "Send message"}</SubmitButton>
      <p className="help">We use these details only to respond to you. See the <a className="link" href="/privacy">Privacy Policy</a>.</p>
    </form>
  );
}
