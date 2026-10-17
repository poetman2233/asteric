"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type FilterOptions = {
  categories: { key: string; label: string }[];
  attorneys: { id: string; name: string }[];
  referrals: { id: string; name: string }[];
  jurisdictions: string[];
};

type Show = Partial<Record<"category" | "attorney" | "referral" | "jurisdiction" | "status" | "dates", boolean>>;

/** Filters live in the URL so every view is shareable and reproducible. */
export function FilterBar({ options, show = { category: true, attorney: true, referral: true, jurisdiction: true, status: true, dates: true }, dateBasisDefault = "opened", extra }: {
  options: FilterOptions; show?: Show; dateBasisDefault?: "opened" | "resolved"; extra?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const set = (key: string, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value); else p.delete(key);
    p.delete("page");
    start(() => router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false }));
  };
  const active = ["category", "attorney", "referral", "jurisdiction", "status", "from", "to", "band", "pbin", "q"].filter((k) => sp.get(k));

  return (
    <div className="filters" role="group" aria-label="Filters" aria-busy={pending}>
      {show.category ? (
        <select className="select" aria-label="Matter category" value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)}>
          <option value="">All categories</option>
          {options.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          <option value="__none">Uncategorized</option>
        </select>
      ) : null}
      {show.attorney ? (
        <select className="select" aria-label="Lead attorney" value={sp.get("attorney") ?? ""} onChange={(e) => set("attorney", e.target.value)}>
          <option value="">All attorneys</option>
          {options.attorneys.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      ) : null}
      {show.referral ? (
        <select className="select" aria-label="Referral source" value={sp.get("referral") ?? ""} onChange={(e) => set("referral", e.target.value)}>
          <option value="">All referral sources</option>
          {options.referrals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          <option value="__none">No referral source</option>
        </select>
      ) : null}
      {show.jurisdiction && options.jurisdictions.length ? (
        <select className="select" aria-label="Jurisdiction" value={sp.get("jurisdiction") ?? ""} onChange={(e) => set("jurisdiction", e.target.value)}>
          <option value="">All jurisdictions</option>
          {options.jurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      ) : null}
      {show.status ? (
        <select className="select" aria-label="Status" value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
          <option value="">Open and closed</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      ) : null}
      {show.dates ? (
        <>
          <select className="select" aria-label="Date applies to" value={sp.get("dateBasis") ?? dateBasisDefault} onChange={(e) => set("dateBasis", e.target.value === dateBasisDefault ? "" : e.target.value)} style={{ minWidth: 120 }}>
            <option value="opened">Opened</option>
            <option value="resolved">Resolved</option>
          </select>
          <input className="input input-sm" type="date" aria-label="From date" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} style={{ width: 150 }} />
          <span className="help" aria-hidden="true">to</span>
          <input className="input input-sm" type="date" aria-label="To date" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} style={{ width: 150 }} />
        </>
      ) : null}
      {extra}
      {active.length ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => start(() => router.replace(pathname, { scroll: false }))}>Clear filters</button>
      ) : null}
    </div>
  );
}
