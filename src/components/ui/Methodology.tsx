"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { METHODOLOGY } from "@/lib/analytics/methodology";

/** "Methodology" link that opens a drawer with the metric's definition, formula, scope and limitations. */
export function MethodologyButton({ id, sample, label = "Methodology" }: { id: string; sample?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const m = METHODOLOGY[id];
  if (!m) return null;
  return (
    <>
      <button type="button" className="method-link" onClick={() => setOpen(true)}>
        <Icon name="info" size={13} /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} variant="drawer" title={m.title} sub="Methodology">
        <div className="stack-lg">
          {sample ? <div className="alert alert-info"><span><strong>Sample:</strong> {sample}</span></div> : null}
          <section className="stack-sm"><p className="eyebrow">Definition</p><p>{m.definition}</p></section>
          <section className="stack-sm"><p className="eyebrow">Formula</p><p>{m.formula}</p></section>
          <section className="stack-sm"><p className="eyebrow">Data included</p><p>{m.included}</p></section>
          <section className="stack-sm"><p className="eyebrow">Exclusions</p><p>{m.excluded}</p></section>
          <section className="stack-sm"><p className="eyebrow">Limitations</p><p>{m.limitations}</p></section>
          <p className="help">Asteric measures and organizes your firm&apos;s historical data. It does not provide legal advice or recommend legal decisions.</p>
        </div>
      </Dialog>
    </>
  );
}
