"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    if (!("page" in patch)) p.delete("page");
    start(() => router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false }));
  };
  return { sp, set, pending };
}

/** Debounced text search bound to the `q` URL parameter. */
export function SearchBox({ placeholder = "Search by name, ID, attorney, category or referral source", param = "q" }: { placeholder?: string; param?: string }) {
  const { sp, set } = useSetParam();
  const [v, setV] = useState(sp.get(param) ?? "");
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get(param) ?? "") !== v.trim()) set({ [param]: v.trim() || null }); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return <input className="input input-sm" type="search" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label="Search" style={{ width: 300, maxWidth: "100%" }} />;
}

/** Segmented control bound to a URL parameter. The first option is the default (removes the parameter). */
export function SegParam({ param, options, label }: { param: string; options: { value: string; label: string }[]; label: string }) {
  const { sp, set, pending } = useSetParam();
  const cur = sp.get(param) ?? options[0]!.value;
  return (
    <div className="seg" role="group" aria-label={label} aria-busy={pending}>
      {options.map((o, i) => (
        <button key={o.value} type="button" aria-pressed={cur === o.value} onClick={() => set({ [param]: i === 0 ? null : o.value })}>{o.label}</button>
      ))}
    </div>
  );
}

/** Select bound to a URL parameter. */
export function SelectParam({ param, options, label, width }: { param: string; options: { value: string; label: string }[]; label: string; width?: number }) {
  const { sp, set } = useSetParam();
  return (
    <select className="select" aria-label={label} value={sp.get(param) ?? ""} onChange={(e) => set({ [param]: e.target.value || null })} style={width ? { width } : undefined}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
