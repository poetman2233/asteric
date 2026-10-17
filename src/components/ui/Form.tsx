"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingLabel, className = "btn btn-primary", disabled }: { children: React.ReactNode; pendingLabel?: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? pendingLabel ?? "Working…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <div className="alert alert-error" role="alert">{state.error}</div>;
  if (state?.ok) return <div className="alert alert-success" role="status">{state.ok}</div>;
  return null;
}

export function Field({ label, htmlFor, help, children }: { label: string; htmlFor: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {help ? <span className="help">{help}</span> : null}
    </div>
  );
}
