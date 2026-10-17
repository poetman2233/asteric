import Link from "next/link";
import { Tip } from "./Tip";

export function PageHead({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Kpi({ label, value, foot, tip, pending }: { label: string; value: React.ReactNode; foot?: React.ReactNode; tip?: React.ReactNode; pending?: boolean }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}{tip ? <Tip>{tip}</Tip> : null}</span>
      <span className={`kpi-value${pending ? " pending" : ""}`}>{value}</span>
      {foot ? <span className="kpi-foot">{foot}</span> : null}
    </div>
  );
}

export function Empty({ title, children, actions }: { title: string; children: React.ReactNode; actions?: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <div className="empty-body">{children}</div>
      {actions?.length ? (
        <div className="empty-actions">
          {actions.map((a) => <Link key={a.href + a.label} href={a.href} className={a.primary ? "btn btn-primary" : "btn btn-secondary"}>{a.label}</Link>)}
        </div>
      ) : null}
    </div>
  );
}

export function Card({ title, actions, children, pad = true, sub }: { title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {title ? (
        <div className="card-head">
          <div>
            <h2 className="section-title">{title}</h2>
            {sub ? <p className="help" style={{ marginTop: 2 }}>{sub}</p> : null}
          </div>
          {actions ? <div className="row" style={{ gap: 10 }}>{actions}</div> : null}
        </div>
      ) : null}
      <div className={pad ? "card-body" : undefined}>{children}</div>
    </section>
  );
}

/** Signed delta with glyph + sign + colour, so direction never depends on colour alone. */
export function Delta({ value, text, goodWhen = "down" }: { value: number | null; text: string; goodWhen?: "up" | "down" | "neutral" }) {
  if (value == null) return <span className="muted">—</span>;
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const tone = goodWhen === "neutral" || dir === "flat" ? "ink2" : dir === goodWhen ? "pos" : "neg";
  return <span className={`num ${tone}`}>{dir === "up" ? "▲ " : dir === "down" ? "▼ " : ""}{text}</span>;
}
