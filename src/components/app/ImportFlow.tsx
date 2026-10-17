"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptAllAction, cancelImportAction, commitImportAction, decideReviewAction, saveMappingAction, uploadImportAction, type ActionResult,
} from "@/app/app/actions";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";

/* ------------------------------------------------------------------ upload */
export function UploadForm({ aiNote }: { aiNote: string | null }) {
  const [state, action] = useActionState(uploadImportAction, {} as ActionResult);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  return (
    <form action={action} className="stack">
      <label className="dropzone" data-over={over} style={{ display: "block", cursor: "pointer" }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false);
          const f = e.dataTransfer.files[0];
          const input = e.currentTarget.querySelector("input[type=file]") as HTMLInputElement | null;
          if (f && input) { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; setFile(f); }
        }}>
        <Icon name="imports" size={22} />
        <p style={{ fontWeight: 550, marginTop: 10 }}>{file ? file.name : "Drop a CSV or XLSX export here, or choose a file"}</p>
        <p className="help" style={{ marginTop: 4 }}>{file ? `${(file.size / 1024).toFixed(0)} KB` : "Up to 4 MB and 20,000 rows. The first row must contain column headers."}</p>
        <input type="file" name="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </label>
      {state.id === "duplicate" ? <input type="hidden" name="force" value="1" /> : null}
      <FormMessage state={state} />
      {aiNote ? <p className="help">{aiNote}</p> : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <SubmitButton pendingLabel="Reading file…" disabled={!file}>{state.id === "duplicate" ? "Import anyway" : "Upload and map columns"}</SubmitButton>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ mapping */
export type MapColumn = { column: string; field: string | null; confidence: number; method: string; samples: string[] };
export type FieldOption = { key: string; label: string; group: string };

const METHOD_LABEL: Record<string, string> = { exact: "Exact header match", synonym: "Known header", fuzzy: "Similar header", type: "Matched by values", ai: "AI suggestion (review)", manual: "Set by you", none: "Not mapped" };

export function MappingEditor({ importId, columns, fields, editable }: { importId: string; columns: MapColumn[]; fields: FieldOption[]; editable: boolean }) {
  const router = useRouter();
  const [assign, setAssign] = useState<Record<string, string | null>>(() => Object.fromEntries(columns.map((c) => [c.column, c.field])));
  const [res, setRes] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const used = useMemo(() => new Map(Object.entries(assign).filter(([, f]) => f).map(([c, f]) => [f!, c])), [assign]);
  const groups = [...new Set(fields.map((f) => f.group))];
  const mapped = Object.values(assign).filter(Boolean).length;
  return (
    <div className="stack">
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="map-row" style={{ background: "var(--surface-2)", fontSize: 11.5, color: "var(--ink-2)", fontWeight: 500 }}>
          <span>Column in your file · sample values</span><span /><span>Asteric field</span><span>Confidence</span>
        </div>
        {columns.map((c) => {
          const f = assign[c.column] ?? null;
          const changed = f !== c.field;
          return (
            <div className="map-row" key={c.column}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 550 }} className="mono">{c.column}</div>
                <div className="help" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.samples.slice(0, 3).join(" · ") || "No values"}</div>
              </div>
              <span aria-hidden="true" className="muted">→</span>
              <select className="select" aria-label={`Field for column ${c.column}`} value={f ?? ""} disabled={!editable}
                onChange={(e) => setAssign((a) => ({ ...a, [c.column]: e.target.value || null }))}>
                <option value="">Do not import</option>
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {fields.filter((x) => x.group === g).map((x) => (
                      <option key={x.key} value={x.key} disabled={used.has(x.key) && used.get(x.key) !== c.column}>{x.label}{used.has(x.key) && used.get(x.key) !== c.column ? " (used)" : ""}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="conf" title={METHOD_LABEL[changed ? "manual" : c.method]}>
                {f ? (changed ? <span>Set by you</span> : <><span className="conf-bar"><span style={{ width: `${Math.round(c.confidence * 100)}%` }} /></span>{Math.round(c.confidence * 100)}%</>) : <span className="muted">—</span>}
              </span>
            </div>
          );
        })}
      </div>
      {res.error ? <div className="alert alert-error" role="alert">{res.error}</div> : null}
      {editable ? (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="help">{mapped} of {columns.length} columns mapped. Unmapped columns are not imported. AI suggestions are never applied without this confirmation.</span>
          <button type="button" className="btn btn-primary" disabled={pending} aria-busy={pending}
            onClick={() => start(async () => { const r = await saveMappingAction(importId, assign); setRes(r); if (!r.error) router.refresh(); })}>
            {pending ? "Checking rows…" : "Confirm mapping"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ value review */
export type ReviewItem = { id: string; field: string; originalValue: string; suggestedValue: string | null; confidence: number; method: string; decision: string; finalValue: string | null; occurrences: number };
export type ReviewOptions = { categories: { key: string; label: string }[]; statuses: { key: string; label: string }[]; resolutions: { key: string; label: string }[]; attorneys: string[]; referrals: string[] };

const FIELD_LABEL: Record<string, string> = { category: "Category", status: "Status", resolution_type: "Resolution", lead_attorney: "Lead attorney", referral_source: "Referral source" };

export function ReviewPanel({ importId, items, options, editable }: { importId: string; items: ReviewItem[]; options: ReviewOptions; editable: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState<"pending" | "all">(items.some((i) => i.decision === "pending") ? "pending" : "all");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult>({});
  const list = items.filter((i) => show === "all" || i.decision === "pending");
  const pendingCount = items.filter((i) => i.decision === "pending").length;
  const label = (field: string, v: string | null) => {
    if (!v) return "Leave blank";
    if (field === "category") return options.categories.find((c) => c.key === v)?.label ?? v;
    if (field === "status") return options.statuses.find((c) => c.key === v)?.label ?? v;
    if (field === "resolution_type") return options.resolutions.find((c) => c.key === v)?.label ?? v;
    return v;
  };
  const decide = (id: string, value: string | null) => start(async () => { const r = await decideReviewAction(importId, id, value); if (r.error) setMsg(r); else router.refresh(); });
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="seg" role="group" aria-label="Show values">
          <button type="button" aria-pressed={show === "pending"} onClick={() => setShow("pending")}>Needs review ({pendingCount})</button>
          <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")}>All values ({items.length})</button>
        </div>
        {editable && pendingCount ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await acceptAllAction(importId); setMsg(r); router.refresh(); })}>Accept all {pendingCount} suggestions</button>
        ) : null}
      </div>
      <FormMessage state={msg} />
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Source values and their normalized values</caption>
          <thead><tr><th>Field</th><th>Value in your file</th><th className="r">Rows</th><th>Suggested</th><th>Confidence</th><th>Decision</th></tr></thead>
          <tbody>
            {list.length ? list.map((i) => <ReviewRow key={i.id} i={i} options={options} editable={editable && !pending} label={label} onDecide={decide} />) : (
              <tr><td colSpan={6} className="muted" style={{ padding: 24, textAlign: "center" }}>Every value has been reviewed.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewRow({ i, options, editable, label, onDecide }: { i: ReviewItem; options: ReviewOptions; editable: boolean; label: (f: string, v: string | null) => string; onDecide: (id: string, v: string | null) => void }) {
  const [v, setV] = useState(i.finalValue ?? i.suggestedValue ?? "");
  const choices = i.field === "category" ? options.categories : i.field === "status" ? options.statuses : i.field === "resolution_type" ? options.resolutions : null;
  const names = i.field === "lead_attorney" ? options.attorneys : i.field === "referral_source" ? options.referrals : [];
  const listId = `dl-${i.id}`;
  return (
    <tr>
      <td className="ink2">{FIELD_LABEL[i.field] ?? i.field}</td>
      <td className="mono" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{i.originalValue}</td>
      <td className="r">{i.occurrences}</td>
      <td>{label(i.field, i.suggestedValue)}</td>
      <td><span className="conf"><span className="conf-bar"><span style={{ width: `${Math.round(i.confidence * 100)}%` }} /></span>{Math.round(i.confidence * 100)}%</span>{i.method === "ai" ? <span className="cell-sub" style={{ display: "block" }}>AI suggestion</span> : null}</td>
      <td>
        {editable ? (
          <div className="row" style={{ gap: 6 }}>
            {choices ? (
              <select className="select" style={{ height: 30, minWidth: 170 }} aria-label={`Value for ${i.originalValue}`} value={v} onChange={(e) => setV(e.target.value)}>
                <option value="">Leave blank</option>
                {choices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            ) : (
              <>
                <input className="input input-sm" style={{ width: 190 }} list={listId} aria-label={`Value for ${i.originalValue}`} value={v} onChange={(e) => setV(e.target.value)} />
                <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
              </>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDecide(i.id, v || null)}>{i.decision === "pending" ? (v === (i.suggestedValue ?? "") ? "Accept" : "Save") : "Update"}</button>
            {i.decision !== "pending" ? <span className="pos" aria-label="Reviewed">✓</span> : null}
          </div>
        ) : <span>{label(i.field, i.finalValue)}{i.decision !== "pending" ? " ✓" : ""}</span>}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ commit */
export function CommitBar({ importId, pendingReviews, duplicates, canCommit, demo }: { importId: string; pendingReviews: number; duplicates: number; canCommit: boolean; demo: boolean }) {
  const router = useRouter();
  const [skip, setSkip] = useState(true);
  const [res, setRes] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <div className="card card-pad stack">
      {duplicates ? (
        <label className="check"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Skip {duplicates} duplicate row{duplicates === 1 ? "" : "s"} (recommended)</label>
      ) : null}
      {pendingReviews ? <p className="help">{pendingReviews} value{pendingReviews === 1 ? "" : "s"} still need review. Unreviewed values are imported as blank, never guessed.</p> : null}
      {demo ? <p className="help">This is the demonstration workspace: you can upload, map and review a real file, but committing is disabled and the upload is deleted at the daily reset.</p> : null}
      <FormMessage state={res} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        {confirmCancel ? (
          <span className="row" style={{ gap: 8 }}>
            <span className="help">Cancel and delete the uploaded file?</span>
            <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => start(async () => { const r = await cancelImportAction(importId); setRes(r); if (!r.error) router.push("/app/imports"); })}>Yes, cancel import</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmCancel(false)}>Keep</button>
          </span>
        ) : <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(true)}>Cancel import</button>}
        <button type="button" className="btn btn-primary" disabled={pending || !canCommit || demo} aria-busy={pending}
          onClick={() => start(async () => { const r = await commitImportAction(importId, skip); setRes(r); if (!r.error) router.refresh(); })}>
          {pending ? "Importing…" : "Commit import"}
        </button>
      </div>
    </div>
  );
}
